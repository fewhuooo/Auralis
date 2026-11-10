package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderToolCallDelta;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.ChatSseEnvelope;
import com.auralis.app.ai.ConversationPurpose;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.ai.internal.persistence.ChatActivityEntity;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Collection;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DisplayToolOrchestratorTests {
    private static final String ENDPOINT = "https://api.deepseek.com/v1";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void realAdapterStreamsVisualToolThenReturnsSmallResultForTheNextModelCall() throws Exception {
        Fixture fixture = new Fixture();
        List<AiProviderRequest> providerRequests = new ArrayList<>();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            providerRequests.add(request);
            if (callNo == 1) {
                chunks.accept(textChunk("Literal :::auralis-steps remains ordinary text.\n"));
                sendCall(chunks, "response-1", 0, "steps-1", DisplayToolRegistry.RENDER_STEPS,
                        "{\"title\":\"Flow\",\"items\":[{\"title\":\"One\"},{\"title\":\"Two\"}]}", true);
                chunks.accept(terminal("response-1", "tool_calls"));
            } else if (callNo == 2) {
                chunks.accept(textChunk("Summary after rendering."));
                chunks.accept(terminal("response-2", "stop"));
            } else throw new AssertionError("unexpected model call");
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(providerRequests).hasSize(2);
        assertThat(providerRequests.get(1).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(com.auralis.app.ai.AiMessageRole.TOOL);
            assertThat(message.toolCallId()).isEqualTo("steps-1");
            assertThat(message.toolName()).isEqualTo(DisplayToolRegistry.RENDER_STEPS);
            assertThat(message.content()).contains("rendered", "blockId");
        });
        assertThat(events).extracting(ChatSseEnvelope::event).containsSubsequence(
                "text.delta", "block.started", "block.item", "block.item", "tool.started",
                "block.completed", "tool.completed", "text.delta", "run.completed");
        assertThat(events.stream().filter(event -> "text.delta".equals(event.event()))
                .map(event -> event.payload().get("text").toString()).reduce("", String::concat))
                .contains("Literal :::auralis-steps remains ordinary text.");
        List<Map<String, Object>> parts = fixture.terminal.get().parts();
        assertThat(parts).extracting(part -> part.get("kind")).containsExactly("text", "block", "text");
        assertThat(parts.get(1)).containsEntry("component", "steps").containsEntry("state", "READY");
        assertThat((List<?>) parts.get(1).get("items")).hasSize(2);
    }

    @Test
    void missingAuthorizedExcerptReturnsRecoverableResultAndKeepsNativeToolPair() throws Exception {
        Fixture fixture = new Fixture();
        String toolName = ChatReadTools.READ_EXCERPT;
        when(fixture.tools.sdkDefinitions()).thenReturn(DisplayToolRegistry.definitions(List.of(
                new com.auralis.app.ai.AiProviderToolDefinition(toolName, "Read one excerpt",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\"},"
                                + "\"chunkId\":{\"type\":\"string\"}},\"required\":[\"sourceId\",\"chunkId\"],"
                                + "\"additionalProperties\":false}"))).stream()
                .map(new AiChatRequestMapper(fixture.mapper)::toSdkTool).toList());
        when(fixture.tools.execute(eq(fixture.readScope), eq(fixture.taskScope), eq(toolName), anyString()))
                .thenThrow(new com.auralis.app.shared.error.DomainException("RESOURCE_NOT_FOUND", "Missing excerpt"));
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<AiProviderRequest> requests = new ArrayList<>();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            requests.add(request);
            if (callNo == 1) {
                sendCall(chunks, "response-data-error", 0, "read-call", toolName,
                        "{\"sourceId\":\"" + sourceId + "\",\"chunkId\":\"" + chunkId + "\"}", false);
                chunks.accept(terminal("response-data-error", "tool_calls"));
                return;
            }
            chunks.accept(textChunk("The selected material does not provide enough evidence."));
            chunks.accept(terminal("response-data-final", "stop"));
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(requests).hasSize(2);
        assertThat(requests.get(1).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(com.auralis.app.ai.AiMessageRole.TOOL);
            assertThat(message.toolCallId()).isEqualTo("read-call");
            assertThat(message.content()).contains("RESOURCE_NOT_FOUND", "repairable", "true", "retry once")
                    .doesNotContain(chunkId.toString());
        });
        assertThat(events).extracting(ChatSseEnvelope::event)
                .containsSubsequence("tool.started", "tool.error", "text.delta", "run.completed")
                .doesNotContain("run.failed", "tool.completed");
        assertThat(fixture.terminal.get().status()).isEqualTo("COMPLETED");
        assertThat(fixture.terminal.get().toolTraceJson()).contains("\"status\":\"error\"");
    }

    @Test
    void secondMissingExcerptClosesToolsAndStillPublishesInsufficientAnswerIfModelRetries() throws Exception {
        Fixture fixture = new Fixture();
        String toolName = ChatReadTools.READ_EXCERPT;
        when(fixture.tools.sdkDefinitions()).thenReturn(DisplayToolRegistry.definitions(List.of(
                new com.auralis.app.ai.AiProviderToolDefinition(toolName, "Read one excerpt",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\"},"
                                + "\"chunkId\":{\"type\":\"string\"}},\"required\":[\"sourceId\",\"chunkId\"],"
                                + "\"additionalProperties\":false}"))).stream()
                .map(new AiChatRequestMapper(fixture.mapper)::toSdkTool).toList());
        when(fixture.tools.execute(eq(fixture.readScope), eq(fixture.taskScope), eq(toolName), anyString()))
                .thenThrow(new com.auralis.app.shared.error.DomainException("RESOURCE_NOT_FOUND", "Missing excerpt"));
        List<AiProviderRequest> requests = new ArrayList<>();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            requests.add(request);
            sendCall(chunks, "response-retry-" + callNo, 0, "read-call-" + callNo, toolName,
                    "{\"sourceId\":\"" + UUID.randomUUID() + "\",\"chunkId\":\"" + UUID.randomUUID() + "\"}", false);
            chunks.accept(terminal("response-retry-" + callNo, "tool_calls"));
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(requests).hasSize(3);
        assertThat(requests.get(1).messages()).filteredOn(message ->
                message.role() == com.auralis.app.ai.AiMessageRole.TOOL).anySatisfy(message ->
                assertThat(message.content()).contains("repairable", "true"));
        assertThat(requests.get(2).messages()).filteredOn(message ->
                message.role() == com.auralis.app.ai.AiMessageRole.TOOL).anySatisfy(message -> {
            assertThat(message.content()).contains("repairable", "false", "closed for this attempt");
            assertThat(message.content()).doesNotContain("chunkId");
        });
        assertThat(requests.get(2).messages()).filteredOn(message ->
                message.role() == com.auralis.app.ai.AiMessageRole.SYSTEM).anySatisfy(message -> {
            assertThat(message.content()).contains("Do not call any tool");
        });
        assertThat(events).extracting(ChatSseEnvelope::event)
                .contains("tool.error", "run.completed", "text.delta")
                .doesNotContain("run.failed");
        assertThat(events.stream().filter(event -> "text.delta".equals(event.event()))
                .map(event -> event.payload().get("text").toString()).reduce("", String::concat))
                .contains("当前所选资料中仍未能读取到足以支持回答的内容");
        assertThat(fixture.terminal.get().status()).isEqualTo("COMPLETED");
        verify(fixture.tools, times(2)).execute(eq(fixture.readScope), eq(fixture.taskScope), eq(toolName), anyString());
    }

    @Test
    void sourceScopeChangeRemainsFatalWhenReadToolFails() throws Exception {
        Fixture fixture = new Fixture();
        String toolName = ChatReadTools.READ_EXCERPT;
        when(fixture.tools.sdkDefinitions()).thenReturn(DisplayToolRegistry.definitions(List.of(
                new com.auralis.app.ai.AiProviderToolDefinition(toolName, "Read one excerpt",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\"},"
                                + "\"chunkId\":{\"type\":\"string\"}},\"required\":[\"sourceId\",\"chunkId\"],"
                                + "\"additionalProperties\":false}"))).stream()
                .map(new AiChatRequestMapper(fixture.mapper)::toSdkTool).toList());
        when(fixture.tools.execute(eq(fixture.readScope), eq(fixture.taskScope), eq(toolName), anyString()))
                .thenThrow(new com.auralis.app.shared.error.DomainException("SOURCE_SCOPE_CHANGED", "Source changed"));
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            sendCall(chunks, "response-scope-change", 0, "scope-call", toolName,
                    "{\"sourceId\":\"" + UUID.randomUUID() + "\",\"chunkId\":\""
                            + UUID.randomUUID() + "\"}", false);
            chunks.accept(terminal("response-scope-change", "tool_calls"));
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(events).extracting(ChatSseEnvelope::event)
                .contains("tool.error", "run.failed")
                .doesNotContain("run.completed", "text.delta");
        assertThat(fixture.terminal.get().status()).isEqualTo("FAILED");
        verify(fixture.taskScope, times(1)).stream(eq(AiStage.CHAT_COMPLETION), eq(AiProviderType.DEEPSEEK),
                any(AiProviderRequest.class), any(AiCredential.class), eq(AiCredentialSource.PLATFORM),
                any(AiProviderCallCancellation.class), any());
    }

    @Test
    void activityWithoutReferenceCommitsReadyBeforeSseAndStopsTheModelLoop() throws Exception {
        String payload = "{\"question\":\"Why does this work?\",\"questionType\":\"single\",\"options\":["
                + "{\"key\":\"A\",\"text\":\"First\"},{\"key\":\"B\",\"text\":\"Second\"}]}";
        ActivityRun result = runActivity(payload);

        assertThat(result.readyPrivateReference()).isNull();
        assertThat(result.readyParts()).contains("\"state\":\"READY\"").doesNotContain("reference");
        assertThat(result.readyMarkdown()).contains("Why does this work?", "First", "Second");
        assertThat(result.events()).extracting(ChatSseEnvelope::event)
                .containsSubsequence("block.started", "block.item", "activity.ready", "tool.completed", "run.completed");
        assertThat(result.events()).extracting(ChatSseEnvelope::event)
                .doesNotContain("run.failed", "block.error");
        assertThat(result.observations()).containsSubsequence("database:ready", "sse:block.completed",
                "sse:activity.ready", "database:finish", "sse:run.completed");
        assertThat(result.providerCalls()).isEqualTo(1);
        assertThat(result.finishStatus()).isEqualTo("COMPLETED");
        assertThat(result.publicEvents().toString()).doesNotContain("private", "reference", "answer");
    }

    @Test
    void validActivityReferencePersistsPrivatelyAndNeverEntersPublicPartsOrSse() throws Exception {
        String payload = "{\"question\":\"Explain the result\",\"questionType\":\"single\",\"options\":["
                + "{\"key\":\"A\",\"text\":\"A\"},{\"key\":\"B\",\"text\":\"B\"}],"
                + "\"reference\":{\"answer\":[\"B\"],\"explanation\":\"private rationale\"}}";
        ActivityRun result = runActivity(payload);

        assertThat(result.readyPrivateReference()).contains("\"answer\":[\"B\"]", "private rationale");
        assertThat(result.readyParts()).doesNotContain("private rationale", "reference");
        assertThat(result.publicEvents().toString()).doesNotContain("private rationale", "reference", "answer");
        assertThat(result.providerCalls()).isEqualTo(1);
    }

    @Test
    void nonExecutableToolTerminalInvalidatesAlreadyPreviewedBlockWithoutCallingTool() throws Exception {
        Fixture fixture = new Fixture();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            chunks.accept(textChunk("Before block."));
            sendCall(chunks, "response-invalid", 0, "invalid-call", DisplayToolRegistry.RENDER_QUIZ,
                    "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                            + "{\"key\":\"A\",\"text\":\"First\"},{\"key\":\"B\",\"text\":\"Second\"}]}", true);
            chunks.accept(terminal("response-invalid", "length"));
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(events).extracting(ChatSseEnvelope::event)
                .contains("block.started", "block.item", "block.error", "run.failed")
                .doesNotContain("activity.ready", "block.completed");
        assertThat(fixture.terminal.get().status()).isEqualTo("FAILED");
        assertThat(fixture.terminal.get().parts()).anySatisfy(part -> {
            assertThat(part).containsEntry("component", "quiz").containsEntry("state", "INVALID");
            assertThat((List<?>) part.get("items")).hasSize(2);
        });
        assertThat(fixture.readyActivities.get()).isZero();
        verify(fixture.taskScope, times(1)).stream(eq(AiStage.CHAT_COMPLETION), eq(AiProviderType.DEEPSEEK),
                any(AiProviderRequest.class), any(AiCredential.class), eq(AiCredentialSource.PLATFORM),
                any(AiProviderCallCancellation.class), any());
    }

    @Test
    void providerEofAfterPreviewInvalidatesBlockAndRetainsItsItems() throws Exception {
        Fixture fixture = new Fixture();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            chunks.accept(textChunk("Before EOF."));
            sendCall(chunks, "response-eof", 0, "eof-call", DisplayToolRegistry.RENDER_QUIZ,
                    "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                            + "{\"key\":\"A\",\"text\":\"First\"},{\"key\":\"B\",\"text\":\"Second\"}]}", true);
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(events).extracting(ChatSseEnvelope::event)
                .contains("block.started", "block.item", "block.error", "run.failed")
                .doesNotContain("activity.ready", "block.completed");
        assertThat(fixture.terminal.get().status()).isEqualTo("FAILED");
        assertInvalidActivitySnapshot(fixture.terminal.get().parts());
        assertThat(fixture.readyActivities.get()).isZero();
    }

    @Test
    void providerCancellationAfterPreviewInvalidatesBlockAndRetainsItsItems() throws Exception {
        Fixture fixture = new Fixture();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            chunks.accept(textChunk("Before cancellation."));
            sendCall(chunks, "response-cancel", 0, "cancel-call", DisplayToolRegistry.RENDER_QUIZ,
                    "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                            + "{\"key\":\"A\",\"text\":\"First\"},{\"key\":\"B\",\"text\":\"Second\"}]}", true);
            cancellation.cancel();
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(events).extracting(ChatSseEnvelope::event)
                .contains("block.started", "block.item", "block.error", "run.cancelled")
                .doesNotContain("activity.ready", "block.completed", "run.completed");
        assertThat(fixture.terminal.get().status()).isEqualTo("CANCELLED");
        assertInvalidActivitySnapshot(fixture.terminal.get().parts());
        assertThat(fixture.readyActivities.get()).isZero();
    }

    @Test
    void historicOutOfScopeSourceIdIsRejectedByRealReadToolsAndCanBeCorrectedWithinAttempt() throws Exception {
        UUID sourceId = UUID.randomUUID();
        SourceView source = source(sourceId, UUID.randomUUID(), "Current notes", "00000000-0000-0000-0000-000000000101");
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.list(any())).thenReturn(List.of(source));
        when(sourceService.findActiveViewsByIds(any(), anyCollection())).thenAnswer(invocation -> {
            Collection<UUID> ids = invocation.getArgument(1);
            return ids.contains(sourceId) ? List.of(source) : List.of();
        });
        RetrievalService retrieval = mock(RetrievalService.class);
        when(retrieval.retrieveWithinSources(any(), any(), anyInt(), any(), any(), anyString()))
                .thenReturn(List.<Citation>of());
        AiSettingsService readSettings = mock(AiSettingsService.class);
        when(readSettings.resolveServerManagedEmbedding()).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.SILICONFLOW, "embedding-model",
                new AiCredential("https://example.invalid", "key", "embedding-model"), AiCredentialSource.PLATFORM));
        Fixture fixture = new Fixture(userId -> new ChatReadTools(new AiChatRequestMapper(new ObjectMapper()),
                new ObjectMapper(), retrieval, sourceService, mock(SourceChunkRepository.class),
                mock(SubjectService.class), readSettings, ChatAgentProperties.defaults(),
                mock(com.auralis.app.ai.OverviewResultService.class)));
        when(fixture.taskScope.embed(eq(AiStage.RETRIEVAL_EMBEDDING), eq(AiProviderType.SILICONFLOW),
                anyString(), anyList(), any(AiCredential.class), eq(AiCredentialSource.PLATFORM)))
                .thenReturn(new AiInvocationResult<>(new EmbeddingResult(
                        List.of(java.util.Collections.nCopies(1024, 0d))), null));
        String historicSourceId = UUID.randomUUID().toString();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            if (callNo == 1) {
                sendCall(chunks, "response-old-scope", 0, "old-scope-call", ChatReadTools.SEARCH,
                        "{\"query\":\"historic query\",\"sourceIds\":[\"" + historicSourceId + "\"]}", false);
                chunks.accept(terminal("response-old-scope", "tool_calls"));
                return;
            }
            if (callNo == 2) {
                sendCall(chunks, "response-current-scope", 0, "current-scope-call", ChatReadTools.SEARCH,
                        "{\"query\":\"current query\",\"sourceIds\":[\"" + sourceId + "\"]}", false);
                chunks.accept(terminal("response-current-scope", "tool_calls"));
                return;
            }
            chunks.accept(textChunk("本轮资料中没有找到足够相关证据，因此资料不足。"));
            chunks.accept(terminal("response-insufficient", "stop"));
        });

        List<ChatSseEnvelope> events = fixture.execute();

        assertThat(events).extracting(ChatSseEnvelope::event)
                .contains("tool.error", "run.completed")
                .doesNotContain("run.failed");
        assertThat(fixture.terminal.get().status()).isEqualTo("COMPLETED");
        assertThat(fixture.terminal.get().markdown()).contains("资料不足");
        assertThat(fixture.providerCallCount.get()).isEqualTo(3);
        verify(fixture.taskScope, times(1)).embed(eq(AiStage.RETRIEVAL_EMBEDDING), eq(AiProviderType.SILICONFLOW),
                anyString(), eq(List.of("current query")), any(AiCredential.class), eq(AiCredentialSource.PLATFORM));
        verify(fixture.taskScope, never()).embed(eq(AiStage.RETRIEVAL_EMBEDDING), eq(AiProviderType.SILICONFLOW),
                anyString(), eq(List.of("historic query")), any(AiCredential.class), eq(AiCredentialSource.PLATFORM));
        verify(retrieval, times(1)).retrieveWithinSources(any(), any(), anyInt(), eq(List.of(sourceId)), any(),
                eq("current query"));
    }

    private ActivityRun runActivity(String payload) throws Exception {
        Fixture fixture = new Fixture();
        fixture.scriptProvider((callNo, request, chunks, cancellation) -> {
            if (callNo != 1) throw new AssertionError("activity must stop the model loop");
            chunks.accept(textChunk("A short setup."));
            sendCall(chunks, "response-activity", 0, "activity-call", DisplayToolRegistry.RENDER_QUIZ,
                    payload, true);
            chunks.accept(terminal("response-activity", "tool_calls"));
        });
        List<String> observations = new ArrayList<>();
        fixture.readyObservations = observations;
        List<ChatSseEnvelope> events = fixture.execute(event -> {
            observations.add("sse:" + event.event());
        });
        FinishSnapshot finish = fixture.terminal.get();
        return new ActivityRun(events, List.copyOf(observations), fixture.readyPrivateReference.get(),
                fixture.readyParts.get(), finish == null ? null : finish.markdown(), fixture.providerCallCount.get(),
                finish == null ? null : finish.status(), events.toString());
    }

    private static AiProviderChunk textChunk(String text) {
        return new AiProviderChunk(text, false, null, AiProviderModelIdentity.missing());
    }

    private static AiProviderChunk terminal(String responseId, String finishReason) {
        return new AiProviderChunk("", true, null, AiProviderModelIdentity.missing(), responseId,
                null, null, finishReason, true);
    }

    private SourceView source(UUID id, UUID subjectId, String title, String revision) {
        return new SourceView(id, subjectId, SourceType.TEXT, title, null, null, "source text", "outline",
                SourceIngestionStatus.READY, UUID.fromString(revision), null, null, 0, Instant.EPOCH, Instant.EPOCH,
                null, null);
    }

    private static void sendCall(Consumer<AiProviderChunk> sink, String responseId, int index,
            String callId, String name, String arguments, boolean argumentsBeforeName) {
        int midpoint = Math.max(1, arguments.length() / 2);
        if (argumentsBeforeName) {
            sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), responseId, index,
                    new AiProviderToolCallDelta(callId, null, arguments.substring(0, midpoint)), null, false));
            sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), responseId, index,
                    new AiProviderToolCallDelta(null, name, arguments.substring(midpoint)), null, false));
        } else {
            sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), responseId, index,
                    new AiProviderToolCallDelta(callId, name, arguments.substring(0, midpoint)), null, false));
            sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), responseId, index,
                    new AiProviderToolCallDelta(null, null, arguments.substring(midpoint)), null, false));
        }
    }

    private interface ProviderScript {
        void answer(int callNo, AiProviderRequest request, Consumer<AiProviderChunk> chunks,
                    AiProviderCallCancellation cancellation) throws Exception;
    }

    private final class Fixture {
        private final UUID userId = UUID.randomUUID();
        private final UUID conversationId = UUID.randomUUID();
        private final UUID runId = UUID.randomUUID();
        private final UUID attemptId = UUID.randomUUID();
        private final UUID userMessageId = UUID.randomUUID();
        private final UUID replyId = UUID.randomUUID();
        private final String endpointHash = sha256(ENDPOINT);
        private final ObjectMapper mapper = new ObjectMapper();
        private final ChatRunEntity run;
        private final ChatAttemptEntity attempt;
        private final AiTaskScope taskScope = mock(AiTaskScope.class);
        private final ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        private final ConversationService conversations = mock(ConversationService.class);
        private final MessageRepository messages = mock(MessageRepository.class);
        private final AiSettingsService settings = mock(AiSettingsService.class);
        private final AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        private final ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        private final ChatReadTools tools;
        private final ChatReadTools.ReadScope readScope;
        private final AtomicInteger providerCallCount = new AtomicInteger();
        private final AtomicInteger readyActivities = new AtomicInteger();
        private final AtomicReference<String> readyPrivateReference = new AtomicReference<>();
        private final AtomicReference<String> readyParts = new AtomicReference<>();
        private final AtomicReference<FinishSnapshot> terminal = new AtomicReference<>();
        private List<String> readyObservations = new ArrayList<>();
        private final AuralisProperties properties;

        private Fixture() throws Exception { this(null); }

        private Fixture(Function<UUID, ChatReadTools> toolsFactory) throws Exception {
            tools = toolsFactory == null ? mock(ChatReadTools.class) : toolsFactory.apply(userId);
            readScope = toolsFactory == null ? mock(ChatReadTools.ReadScope.class) : null;
            String requestContext = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                    + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
            run = new ChatRunEntity(runId, userId, conversationId, "request-display", "request-hash",
                    requestContext, "turn", userMessageId, runId, 7L);
            run.pointToAttempt(attemptId, replyId);
            run.mark("RUNNING");
            attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-display", "request-hash", 1,
                    "worker-display", 7L, replyId, "[]", "[]", Instant.now().plusSeconds(60));
            attempt.markRunning();
            MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 1,
                    AiMessageRole.USER, AiMessageStatus.COMPLETED, "Explain this", null, null, null, null);

            AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                    "test-model", new AiCredential(ENDPOINT, "synthetic-key"), AiCredentialSource.PLATFORM);
            when(persistence.claim(userId, conversationId, runId, attemptId, 7L))
                    .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
            when(persistence.executionProfile(userId, conversationId, runId))
                    .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK,
                            "test-model", endpointHash));
            doAnswer(invocation -> {
                String status = invocation.getArgument(6);
                String partsJson = invocation.getArgument(7);
                String toolTraceJson = invocation.getArgument(8);
                String markdown = invocation.getArgument(10);
                readyObservations.add("database:finish");
                terminal.set(new FinishSnapshot(status, readParts(partsJson), toolTraceJson, markdown));
                if (!"COMPLETED".equals(run.getStatus())) run.mark(status);
                return new ChatRuntimePersistenceService.Terminal(run, attempt, replyId);
            }).when(persistence).finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(7L), anyMap(),
                    anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any());
            doAnswer(invocation -> {
                readyActivities.incrementAndGet();
                readyObservations.add("database:ready");
                readyPrivateReference.set(invocation.getArgument(11));
                readyParts.set(invocation.getArgument(12));
                UUID activityId = invocation.getArgument(6);
                UUID blockId = invocation.getArgument(7);
                String questionType = invocation.getArgument(9);
                String publicPayload = invocation.getArgument(10);
                String privatePayload = invocation.getArgument(11);
                return new ChatActivityEntity(activityId, runId, userId, attemptId, replyId, blockId, 1,
                        questionType, "READY", publicPayload, privatePayload);
            }).when(persistence).readyActivity(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(7L), anyMap(),
                    any(), any(), anyInt(), anyString(), anyString(), any(), anyString(), anyString(), anyString(),
                    anyString(), anyString(), anyLong());
            when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
            if (readScope != null) {
                when(tools.begin(eq(userId), any())).thenReturn(readScope);
                when(readScope.revisionSnapshot()).thenReturn(Map.of());
                when(tools.sdkDefinitions()).thenReturn(DisplayToolRegistry.definitions(List.of()).stream()
                        .map(new AiChatRequestMapper(mapper)::toSdkTool).toList());
            }
            when(gateway.beginTask(any())).thenReturn(taskScope);
            when(taskScope.taskId()).thenReturn(AiTaskContext.chatAgentLedgerTaskId(userId, runId));
            when(taskScope.usage()).thenReturn(new AiProviderUsage(1, 1, 1L, 1L, 2, true));
            when(adapterFactory.create(any(), eq(taskScope), any())).thenAnswer(invocation ->
                    new ChatAgentModelAdapter(invocation.getArgument(0), invocation.getArgument(1),
                            new AiChatRequestMapper(mapper), ChatAgentProperties.defaults(), 4096, 10_000,
                            true, invocation.getArgument(2)));
            when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                    List.<MessageView>of(), Instant.now(), Instant.now(), null, 0L, ConversationPurpose.GENERAL,
                    null, (short) 1, true, null, com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
            when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));
            when(persistence.conversationRunHistory(userId, conversationId)).thenReturn(List.of());
            AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
            when(ai.maxPromptChars()).thenReturn(50_000);
            properties = mock(AuralisProperties.class);
            when(properties.ai()).thenReturn(ai);
        }

        private void scriptProvider(ProviderScript script) throws Exception {
            doAnswer(invocation -> {
                AiProviderRequest request = invocation.getArgument(2);
                @SuppressWarnings("unchecked") Consumer<AiProviderChunk> chunks = invocation.getArgument(6);
                AiProviderCallCancellation cancellation = invocation.getArgument(5);
                int callNo = providerCallCount.incrementAndGet();
                script.answer(callNo, request, chunks, cancellation);
                return new AiInvocationResult<Void>(null, new AiProviderUsage(1, 1, 1L, 1L, 2, true));
            }).when(taskScope).stream(eq(AiStage.CHAT_COMPLETION), eq(AiProviderType.DEEPSEEK),
                    any(AiProviderRequest.class), any(AiCredential.class), eq(AiCredentialSource.PLATFORM),
                    any(AiProviderCallCancellation.class), any());
        }

        private List<ChatSseEnvelope> execute() {
            return execute(event -> { });
        }

        private List<ChatSseEnvelope> execute(Consumer<ChatSseEnvelope> observer) {
            List<ChatSseEnvelope> events = new ArrayList<>();
            ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages,
                    settings, gateway, adapterFactory, ChatAgentProperties.defaults(), tools,
                    mock(AiUsageQueryService.class), mapper, properties);
            orchestrator.executeAdmission(userId,
                    new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false),
                    "request-display", null, event -> {
                        events.add(event);
                        observer.accept(event);
                    });
            return events;
        }
    }

    private record ActivityRun(List<ChatSseEnvelope> events, List<String> observations,
                               String readyPrivateReference, String readyParts, String readyMarkdown,
                               int providerCalls, String finishStatus, String publicEvents) {}

    private record FinishSnapshot(String status, List<Map<String, Object>> parts, String toolTraceJson, String markdown) {}

    private static List<Map<String, Object>> readParts(String json) throws Exception {
        return MAPPER.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
    }

    private static void assertInvalidActivitySnapshot(List<Map<String, Object>> parts) {
        assertThat(parts).anySatisfy(part -> {
            assertThat(part).containsEntry("component", "quiz").containsEntry("state", "INVALID");
            assertThat((List<?>) part.get("items")).hasSize(2);
        });
    }

    private static String sha256(String text) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(text.getBytes(StandardCharsets.UTF_8)));
    }
}
