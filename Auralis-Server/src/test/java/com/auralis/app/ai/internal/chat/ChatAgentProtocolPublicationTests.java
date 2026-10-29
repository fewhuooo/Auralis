package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.*;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.usage.*;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.shared.config.AuralisProperties;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.PartialResponse;
import dev.langchain4j.model.chat.response.PartialResponseContext;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.FinishReason;
import org.junit.jupiter.api.Test;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChatAgentProtocolPublicationTests {
    @Test
    void successfulToolEvidenceIsPrivateAndRestoredIntoTheNextTurnProviderRequest() throws Exception {
        UUID userId = UUID.randomUUID(), conversationId = UUID.randomUUID(), sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID(), firstRunId = UUID.randomUUID(), secondRunId = UUID.randomUUID();
        UUID firstAttemptId = UUID.randomUUID(), secondAttemptId = UUID.randomUUID();
        UUID firstUserId = UUID.randomUUID(), firstReplyId = UUID.randomUUID();
        UUID secondUserId = UUID.randomUUID(), secondReplyId = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String context = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity firstRun = new ChatRunEntity(firstRunId, userId, conversationId, "request-1", "hash-1",
                context, "turn", firstUserId, UUID.randomUUID(), 1L);
        ChatRunEntity secondRun = new ChatRunEntity(secondRunId, userId, conversationId, "request-2", "hash-2",
                context, "turn", secondUserId, UUID.randomUUID(), 3L);
        firstRun.pointToAttempt(firstAttemptId, firstReplyId);
        secondRun.pointToAttempt(secondAttemptId, secondReplyId);
        ChatAttemptEntity firstAttempt = new ChatAttemptEntity(firstAttemptId, firstRunId, userId, "request-1", "hash-1",
                1, "worker-a", 1L, firstReplyId, "[]", "[]", Instant.now().plusSeconds(60));
        ChatAttemptEntity secondAttempt = new ChatAttemptEntity(secondAttemptId, secondRunId, userId, "request-2", "hash-2",
                1, "worker-a", 3L, secondReplyId, "[]", "[]", Instant.now().plusSeconds(60));
        firstAttempt.markRunning(); secondAttempt.markRunning();
        MessageEntity firstUser = new MessageEntity(firstUserId, conversationId, userId, 1,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Find the source fact", null, null, null, null);
        MessageEntity secondUser = new MessageEntity(secondUserId, conversationId, userId, 3,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Explain that fact", null, null, null, null);
        MessageView firstUserView = new MessageView(firstUserId, 1, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                "Find the source fact", null, null, Instant.now());
        MessageView firstReplyView = new MessageView(firstReplyId, 2, AiMessageRole.ASSISTANT, AiMessageStatus.COMPLETED,
                "The source says a private fact.", null, null, Instant.now());
        MessageView secondUserView = new MessageView(secondUserId, 3, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                "Explain that fact", null, null, Instant.now());

        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        ChatAgentModelAdapter firstAdapter = mock(ChatAgentModelAdapter.class);
        ChatAgentModelAdapter secondAdapter = mock(ChatAgentModelAdapter.class);
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);
        ToolSpecification definition = ToolSpecification.fromJson("{\"name\":\"read_source\","
                + "\"description\":\"Read source evidence\",\"parameters\":{\"type\":\"object\","
                + "\"properties\":{\"sourceId\":{\"type\":\"string\"}},\"required\":[\"sourceId\"]}}");
        ToolExecutionRequest toolRequest = ToolExecutionRequest.builder().id("call-1").name("read_source")
                .arguments("{\"sourceId\":\"" + sourceId + "\"}").build();
        dev.langchain4j.model.chat.response.CompleteToolCall complete =
                mock(dev.langchain4j.model.chat.response.CompleteToolCall.class);
        when(complete.toolExecutionRequest()).thenReturn(toolRequest);
        when(persistence.claim(userId, conversationId, firstRunId, firstAttemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.claim(userId, conversationId, secondRunId, secondAttemptId, 3L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(eq(userId), eq(conversationId), any(UUID.class)))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK, "test-model", endpointHash));
        when(persistence.finish(eq(userId), eq(conversationId), eq(firstRunId), eq(firstAttemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenReturn(new ChatRuntimePersistenceService.Terminal(firstRun, firstAttempt, firstReplyId));
        when(persistence.finish(eq(userId), eq(conversationId), eq(secondRunId), eq(secondAttemptId), eq(3L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenReturn(new ChatRuntimePersistenceService.Terminal(secondRun, secondAttempt, secondReplyId));
        when(persistence.conversationRunHistory(userId, conversationId)).thenReturn(List.of(), List.of(firstRun, secondRun));
        when(persistence.privateToolEvidence(userId, conversationId, firstRunId, firstAttemptId))
                .thenAnswer(ignored -> firstAttempt.getPrivateToolEvidenceJson());
        doAnswer(invocation -> { firstAttempt.updatePrivateToolEvidence(invocation.getArgument(9)); return null; })
                .when(persistence).checkpoint(eq(userId), eq(conversationId), eq(firstRunId), eq(firstAttemptId), eq(1L),
                        anyMap(), anyString(), anyString(), anyLong(), anyString());
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        when(tools.sdkDefinitions()).thenReturn(List.of(definition));
        when(tools.execute(eq(readScope), eq(taskScope), eq("read_source"), anyString())).thenReturn(
                "{\"sourceId\":\"" + sourceId + "\",\"chunkId\":\"chunk-private\",\"ordinal\":7,"
                        + "\"title\":\"Source title\",\"query\":\"query\",\"range\":{\"start\":1,\"end\":2},"
                        + "\"excerpt\":\"PRIVATE_FACT_9C31\"}");
        when(readScope.revisionSnapshot()).thenReturn(Map.of(sourceId, revision));
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(adapterFactory.create(any(), eq(taskScope))).thenReturn(firstAdapter, secondAdapter);
        when(conversations.get(userId, conversationId)).thenReturn(
                new ConversationView(conversationId, "Chat", List.of(), Instant.now(), Instant.now(), null, 0L,
                        ConversationPurpose.GENERAL, null, (short) 1, true, null),
                new ConversationView(conversationId, "Chat", List.of(firstUserView, firstReplyView, secondUserView),
                        Instant.now(), Instant.now(), null, 0L, ConversationPurpose.GENERAL, null, (short) 1, true, null));
        when(messages.findById(firstUserId)).thenReturn(Optional.of(firstUser));
        when(messages.findById(secondUserId)).thenReturn(Optional.of(secondUser));
        when(persistence.requireRun(userId, conversationId, firstRunId)).thenReturn(firstRun);
        when(persistence.attemptHistory(firstRunId)).thenReturn(List.of(firstAttempt));
        when(persistence.executionActive(userId, conversationId, firstRunId)).thenReturn(false);
        AtomicInteger firstCall = new AtomicInteger();
        doAnswer(invocation -> {
            StreamingChatResponseHandler handler = invocation.getArgument(1);
            if (firstCall.incrementAndGet() == 1) {
                handler.onCompleteToolCall(complete);
                handler.onCompleteResponse(dev.langchain4j.model.chat.response.ChatResponse.builder()
                        .aiMessage(dev.langchain4j.data.message.AiMessage.from(toolRequest))
                        .finishReason(FinishReason.TOOL_EXECUTION).build());
            } else {
                handler.onCompleteResponse(dev.langchain4j.model.chat.response.ChatResponse.builder()
                        .aiMessage(dev.langchain4j.data.message.AiMessage.from("The evidence says this."))
                        .finishReason(FinishReason.STOP).build());
            }
            return null;
        }).when(firstAdapter).chat(any(ChatRequest.class), any(StreamingChatResponseHandler.class));
        AtomicReference<ChatRequest> secondRequest = new AtomicReference<>();
        doAnswer(invocation -> {
            secondRequest.set(invocation.getArgument(0));
            ((StreamingChatResponseHandler) invocation.getArgument(1)).onError(new RuntimeException("synthetic stop"));
            return null;
        }).when(secondAdapter).chat(any(ChatRequest.class), any(StreamingChatResponseHandler.class));

        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, ChatAgentProperties.defaults(), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), (AuralisProperties) null);
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(firstRun, firstAttempt, firstUserId, false),
                "request-1", null, event -> {});
        ChatRunStatusView status = orchestrator.status(userId, conversationId, firstRunId);
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(secondRun, secondAttempt, secondUserId, false),
                "request-2", null, event -> {});

        assertThat(firstAttempt.getPrivateToolEvidenceJson()).contains("PRIVATE_FACT_9C31", revision.toString(), "chunk-private");
        assertThat(secondRequest.get().messages()).anySatisfy(message -> {
            assertThat(message).isInstanceOf(ToolExecutionResultMessage.class);
            assertThat(((ToolExecutionResultMessage) message).text()).contains("PRIVATE_FACT_9C31", revision.toString());
        });
        List<ChatMessage> requestMessages = secondRequest.get().messages();
        int priorUserIndex = indexOfUserText(requestMessages, "Find the source fact");
        int toolCallIndex = indexOfToolCall(requestMessages, "call-1");
        int toolResultIndex = indexOfToolResult(requestMessages, "call-1");
        int finalReplyIndex = indexOfAssistantText(requestMessages, "The source says a private fact.");
        int currentUserIndex = indexOfUserText(requestMessages, "Explain that fact");
        assertThat(priorUserIndex).isLessThan(toolCallIndex);
        assertThat(toolCallIndex).isLessThan(toolResultIndex);
        assertThat(toolResultIndex).isLessThan(finalReplyIndex);
        assertThat(finalReplyIndex).isLessThan(currentUserIndex);
        String publicStatus = new ObjectMapper().writeValueAsString(status);
        String publicView = new ObjectMapper().writeValueAsString(conversations.get(userId, conversationId));
        assertThat(publicStatus).doesNotContain("PRIVATE_FACT_9C31", "chunk-private", "argumentsJson", "resultJson");
        assertThat(publicView).doesNotContain("PRIVATE_FACT_9C31", "chunk-private", "argumentsJson", "resultJson");
        assertThat(status.toolTrace().toString()).doesNotContain("PRIVATE_FACT_9C31", "chunk-private");
    }

    private int indexOfUserText(List<ChatMessage> messages, String text) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i) instanceof dev.langchain4j.data.message.UserMessage user
                    && user.hasSingleText() && user.singleText().equals(text)) return i;
        }
        return -1;
    }

    private int indexOfToolCall(List<ChatMessage> messages, String id) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i) instanceof dev.langchain4j.data.message.AiMessage assistant
                    && assistant.toolExecutionRequests().stream().anyMatch(call -> call.id().equals(id))) return i;
        }
        return -1;
    }

    private int indexOfToolResult(List<ChatMessage> messages, String id) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i) instanceof ToolExecutionResultMessage result && result.id().equals(id)) return i;
        }
        return -1;
    }

    private int indexOfAssistantText(List<ChatMessage> messages, String text) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i) instanceof dev.langchain4j.data.message.AiMessage assistant
                    && text.equals(assistant.text())) return i;
        }
        return -1;
    }

    @Test
    void actualProviderRequestContainsProtocolAndSnapshotPreservesTextAndInvalidPartialBlockOrder() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID userMessageId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String requestContext = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity run = new ChatRunEntity(runId, userId, conversationId, "request-1", "hash",
                requestContext, "turn", userMessageId, UUID.randomUUID(), 1L);
        run.pointToAttempt(attemptId, replyId);
        run.mark("RUNNING");
        ChatAttemptEntity attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "hash", 1,
                "worker-a", 1L, replyId, "[]", "[]", Instant.now().plusSeconds(30));
        attempt.markRunning();
        MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 1,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Explain the flow", null, null, null, null);

        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        ChatAgentModelAdapter adapter = mock(ChatAgentModelAdapter.class);
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);

        when(persistence.claim(userId, conversationId, runId, attemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(userId, conversationId, runId))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK,
                        "test-model", endpointHash));
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenAnswer(invocation -> new ChatRuntimePersistenceService.Terminal(run, attempt, replyId));
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        when(tools.sdkDefinitions()).thenReturn(List.of());
        when(readScope.revisionSnapshot()).thenReturn(Map.of(sourceId, revision));
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(adapterFactory.create(any(), eq(taskScope))).thenReturn(adapter);
        when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                List.<MessageView>of(), Instant.now(), Instant.now(), null, 0L, ConversationPurpose.GENERAL,
                null, (short) 1, true, null));
        when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));
        String output = "Before.\n:::auralis-steps\n{\"type\":\"meta\",\"title\":\"Partial\"}\n"
                + "{\"type\":\"item\",\"title\":\"Saved row\"}\n{invalid json\nAfter.\n";
        doAnswer(invocation -> {
            StreamingChatResponseHandler handler = invocation.getArgument(1);
            handler.onPartialResponse(new PartialResponse(output), mock(PartialResponseContext.class));
            handler.onCompleteResponse(dev.langchain4j.model.chat.response.ChatResponse.builder()
                    .aiMessage(AiMessage.from("Finished."))
                    .finishReason(FinishReason.STOP).build());
            return null;
        }).when(adapter).chat(any(ChatRequest.class), any(StreamingChatResponseHandler.class));

        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, ChatAgentProperties.defaults(), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), (AuralisProperties) null);
        List<com.auralis.app.ai.ChatSseEnvelope> emitted = new ArrayList<>();
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false),
                "request-1", null, emitted::add);

        org.mockito.ArgumentCaptor<ChatRequest> requestCaptor = org.mockito.ArgumentCaptor.forClass(ChatRequest.class);
        verify(adapter).chat(requestCaptor.capture(), any(StreamingChatResponseHandler.class));
        ChatMessage system = requestCaptor.getValue().messages().get(0);
        assertThat(((SystemMessage) system).text())
                .contains(":::auralis-steps", ":::auralis-quiz", ":::auralis-question", "NDJSON",
                        "\"type\":\"reference\"", "end of the turn", "no prose after its closing :::");

        org.mockito.ArgumentCaptor<String> snapshotCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.ArgumentCaptor<String> markdownCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(persistence).finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), snapshotCaptor.capture(), anyString(), anyLong(), markdownCaptor.capture(), anyString(), any());
        List<Map<String, Object>> parts = new ObjectMapper().readValue(snapshotCaptor.getValue(),
                new TypeReference<List<Map<String, Object>>>() {});
        assertThat(parts).as("persisted parts: %s events: %s", parts, emitted)
                .extracting(part -> part.get("kind"))
                .containsExactly("text", "block", "text");
        assertThat(parts.get(0).get("text")).isEqualTo("Before.\n");
        assertThat(parts.get(1)).containsEntry("state", "INVALID");
        assertThat(parts.get(2).get("text").toString()).contains("After.\n");
        Map<?, ?> partialItem = (Map<?, ?>) ((List<?>) parts.get(1).get("items")).get(0);
        assertThat(partialItem.get("title")).isEqualTo("Saved row");
        String markdown = markdownCaptor.getValue();
        assertThat(markdown.indexOf("Before.")).isLessThan(markdown.indexOf("### Partial"));
        assertThat(markdown.indexOf("### Partial")).isLessThan(markdown.indexOf("After."));
        assertThat(parts.stream().filter(part -> "block".equals(part.get("kind")) && "INVALID".equals(part.get("state"))))
                .hasSize(1);
    }
}
