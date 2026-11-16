package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.ChatSseEnvelope;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.shared.config.AuralisProperties;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.CompleteToolCall;
import dev.langchain4j.model.chat.response.PartialResponse;
import dev.langchain4j.model.chat.response.PartialResponseContext;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.FinishReason;
import org.junit.jupiter.api.Test;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChatDisplayToolArgumentRepairTests {
    private static final String BAD_STEPS = "{\"title\":\"Flow\"}";
    private static final String VALID_STEPS = "{\"title\":\"Flow\",\"items\":[{\"title\":\"One\"}]}";
    private static final String VALID_QUIZ = "{\"question\":\"Pick one\",\"questionType\":\"single\","
            + "\"options\":[{\"key\":\"A\",\"text\":\"a\"},{\"key\":\"B\",\"text\":\"b\"}]}";
    private static final String EMPTY_STOP = "__test_empty_stop__";
    private static final String PROVIDER_FAILURE = "__test_provider_failure__";
    private static final String CANCEL = "__test_cancel__";

    @Test
    void returnsOnePairedCorrectionAndSkipsHigherIndexActivityBeforeValidRetry() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("bad-display", DisplayToolRegistry.RENDER_STEPS, BAD_STEPS),
                        new Call("later-activity", DisplayToolRegistry.RENDER_QUIZ, VALID_QUIZ)),
                List.of(new Call("corrected-display", DisplayToolRegistry.RENDER_STEPS, VALID_STEPS)),
                List.of()));

        assertThat(result.providerRequests).hasSize(3);
        var callsInRetry = result.providerRequests.get(1).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.ASSISTANT
                        && !message.toolCalls().isEmpty()).findFirst().orElseThrow();
        assertThat(callsInRetry.toolCalls()).extracting(call -> call.id())
                .containsExactly("bad-display", "later-activity");
        assertThat(result.providerRequests.get(1).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.TOOL)
                .map(message -> message.toolCallId()).toList()).contains("bad-display", "later-activity");
        assertThat(result.providerRequests.get(1).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.TOOL
                        && message.toolCallId().equals("bad-display"))
                .map(message -> message.content()).findFirst().orElseThrow())
                .contains("CHAT_TOOL_ARGUMENT_INVALID", "$.items", "items")
                .doesNotContain("Flow");
        assertThat(result.providerRequests.get(1).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.TOOL
                        && message.toolCallId().equals("later-activity"))
                .map(message -> message.content()).findFirst().orElseThrow())
                .contains("本工具尚未执行，并非不可用。修正前一个工具参数后，如仍需要，请重新调用本工具；不要重复已成功工具。")
                .doesNotContain("private", "reference", VALID_QUIZ);
        assertThat(result.events).extracting(ChatSseEnvelope::event)
                .contains("block.error", "tool.error", "block.completed", "run.completed")
                .doesNotContain("activity.ready");
        List<Map<String, Object>> parts = new ObjectMapper().readValue(result.partsJson.get(),
                new TypeReference<List<Map<String, Object>>>() {});
        assertThat(parts).anySatisfy(part -> assertThat(part).containsEntry("component", "steps")
                .containsEntry("state", "READY"));
        assertThat(parts).anySatisfy(part -> assertThat(part).containsEntry("component", "quiz")
                .containsEntry("state", "INVALID"));
        assertThat(result.finishedStatus.get()).isEqualTo("COMPLETED");
        verify(result.tools, never()).execute(any(), any(), anyString(), anyString());
    }

    @Test
    void secondSchemaRejectionFailsWithoutAThirdModelCall() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("bad-first", DisplayToolRegistry.RENDER_STEPS, BAD_STEPS)),
                List.of(new Call("bad-again", DisplayToolRegistry.RENDER_STEPS, BAD_STEPS)),
                List.of()));

        assertThat(result.providerRequests).hasSize(2);
        assertThat(result.finishedStatus.get()).isEqualTo("FAILED");
        assertThat(result.events).extracting(ChatSseEnvelope::event).contains("run.failed")
                .doesNotContain("run.completed");
    }

    @Test
    void emptyStopGetsOneContinuationAndKeepsLaterReadToolExchangePaired() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("empty", EMPTY_STOP, "")),
                List.of(new Call("outline-call", "read_source_overview", "{}")),
                List.of()));

        assertThat(result.providerRequests).hasSize(3);
        var assistant = result.providerRequests.get(2).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.ASSISTANT
                        && !message.toolCalls().isEmpty()).findFirst().orElseThrow();
        assertThat(assistant.toolCalls()).extracting(call -> call.id()).containsExactly("outline-call");
        assertThat(result.providerRequests.get(2).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.TOOL)
                .map(message -> message.toolCallId()).toList()).containsExactly("outline-call");
        assertThat(result.providerRequests.get(1).messages().stream()
                .filter(message -> message.role() == com.auralis.app.ai.AiMessageRole.SYSTEM)
                .map(message -> message.content()).reduce("", String::concat))
                .contains("previous response had no visible answer", "original question");
        assertThat(result.finishedStatus.get()).isEqualTo("COMPLETED");
    }

    @Test
    void repeatedEmptyStopsFinishWithVisibleText() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("empty-first", EMPTY_STOP, "")),
                List.of(new Call("empty-second", EMPTY_STOP, ""))));

        assertThat(result.providerRequests).hasSize(2);
        assertThat(result.events).extracting(ChatSseEnvelope::event).contains("text.delta", "run.completed");
        assertThat(result.partsJson.get()).contains("我这次没有生成可显示的回答，请重新发送问题或换个问法。");
        assertThat(result.finishedStatus.get()).isEqualTo("COMPLETED");
    }

    @Test
    void noIterationRemainingFinishesWithVisibleTextWithoutAnotherModelCall() throws Exception {
        TestRun result = execute(List.of(List.of(new Call("empty", EMPTY_STOP, ""))), 1);

        assertThat(result.providerRequests).hasSize(1);
        assertThat(result.partsJson.get()).contains("我这次没有生成可显示的回答，请重新发送问题或换个问法。");
        assertThat(result.finishedStatus.get()).isEqualTo("COMPLETED");
    }

    @Test
    void readyDisplayComponentAloneDoesNotTriggerEmptyReplyContinuation() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("steps", DisplayToolRegistry.RENDER_STEPS, VALID_STEPS)),
                List.of(new Call("empty", EMPTY_STOP, ""))));

        assertThat(result.providerRequests).hasSize(2);
        assertThat(result.partsJson.get()).contains("\"component\":\"steps\"", "\"state\":\"READY\"")
                .doesNotContain("我这次没有生成可显示的回答");
        assertThat(result.finishedStatus.get()).isEqualTo("COMPLETED");
    }

    @Test
    void providerFailureDuringContinuationRemainsFailed() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("empty", EMPTY_STOP, "")),
                List.of(new Call("failure", PROVIDER_FAILURE, ""))));

        assertThat(result.providerRequests).hasSize(2);
        assertThat(result.events).extracting(ChatSseEnvelope::event).contains("run.failed")
                .doesNotContain("run.completed");
        assertThat(result.finishedStatus.get()).isEqualTo("FAILED");
    }

    @Test
    void cancellationDuringContinuationRemainsCancelled() throws Exception {
        TestRun result = execute(List.of(
                List.of(new Call("empty", EMPTY_STOP, "")),
                List.of(new Call("cancel", CANCEL, ""))));

        assertThat(result.providerRequests).hasSize(2);
        assertThat(result.events).extracting(ChatSseEnvelope::event).contains("run.cancelled")
                .doesNotContain("run.completed");
        assertThat(result.partsJson.get()).doesNotContain("我这次没有生成可显示的回答");
        assertThat(result.finishedStatus.get()).isEqualTo("CANCELLED");
    }

    private TestRun execute(List<List<Call>> responses) throws Exception {
        return execute(responses, ChatAgentProperties.defaults().maxIterations());
    }

    private TestRun execute(List<List<Call>> responses, int maxIterations) throws Exception {
        UUID userId = UUID.randomUUID(), conversationId = UUID.randomUUID(), runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID(), userMessageId = UUID.randomUUID(), replyId = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        String context = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity run = new ChatRunEntity(runId, userId, conversationId, "request", "hash", context,
                "turn", userMessageId, UUID.randomUUID(), 1L);
        run.pointToAttempt(attemptId, replyId); run.mark("RUNNING");
        ChatAttemptEntity attempt = new ChatAttemptEntity(attemptId, runId, userId, "request", "hash", 1,
                "worker-a", 1L, replyId, "[]", "[]", Instant.now().plusSeconds(60));
        attempt.markRunning();
        MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 1,
                com.auralis.app.ai.AiMessageRole.USER, com.auralis.app.ai.AiMessageStatus.COMPLETED,
                "Explain the flow", null, null, null, null);
        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        com.auralis.app.ai.AiSettingsService settings = mock(com.auralis.app.ai.AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        ChatAgentModelAdapter adapter = mock(ChatAgentModelAdapter.class);
        com.auralis.app.ai.AiSettingsService.ResolvedSettings resolved =
                new com.auralis.app.ai.AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK, "test-model",
                        new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);
        AtomicReference<String> finishedStatus = new AtomicReference<>();
        AtomicReference<String> partsJson = new AtomicReference<>();
        List<AiProviderRequest> providerRequests = new ArrayList<>();
        List<ChatSseEnvelope> events = new ArrayList<>();
        AtomicInteger responseIndex = new AtomicInteger();
        AtomicReference<AiProviderCallCancellation> cancellation = new AtomicReference<>();
        AtomicReference<java.util.function.Consumer<String>> reasoningSink = new AtomicReference<>();

        when(persistence.claim(userId, conversationId, runId, attemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(userId, conversationId, runId))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK,
                        "test-model", endpointHash));
        when(persistence.executionOwner(userId, conversationId, runId, attemptId, 1L)).thenReturn(true);
        when(persistence.cancellationRequested(userId, runId, attemptId)).thenReturn(false);
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenAnswer(invocation -> {
                    String status = invocation.getArgument(6);
                    finishedStatus.set(status);
                    partsJson.set(invocation.getArgument(7));
                    run.mark(status);
                    attempt.completeMessage(replyId, status, invocation.getArgument(12));
                    return new ChatRuntimePersistenceService.Terminal(run, attempt, replyId);
                });
        doAnswer(invocation -> { attempt.updatePrivateToolEvidence(invocation.getArgument(9)); return null; })
                .when(persistence).checkpoint(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L),
                        anyMap(), anyString(), anyString(), anyLong(), anyString());
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        AiChatRequestMapper mapper = new AiChatRequestMapper(new ObjectMapper());
        when(tools.sdkDefinitions()).thenReturn(java.util.stream.Stream.concat(
                DisplayToolRegistry.definitions(List.of()).stream(),
                java.util.stream.Stream.of(new AiProviderToolDefinition("read_source_overview", "Read an outline",
                        "{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}")))
                .map(mapper::toSdkTool).toList());
        when(readScope.revisionSnapshot()).thenReturn(Map.of());
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(adapterFactory.create(any(), eq(taskScope), any())).thenAnswer(invocation -> {
            cancellation.set(((ChatAgentRunContext) invocation.getArgument(0)).cancellation());
            reasoningSink.set(invocation.getArgument(2));
            return adapter;
        });
        when(adapter.mapRequest(any(ChatRequest.class), anyMap())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked") Map<String, String> reasoning = invocation.getArgument(1);
            return mapper.toProviderRequest(invocation.getArgument(0), "test-model", 256, reasoning);
        });
        when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                List.<MessageView>of(), Instant.now(), Instant.now(), null, 0L,
                (short) 1, true, null,
                com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
        when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));
        when(tools.execute(eq(readScope), any(AiTaskScope.class), eq("read_source_overview"), anyString()))
                .thenReturn("{\"status\":\"ok\",\"title\":\"Outline\"}");
        doAnswer(invocation -> {
            ChatRequest request = invocation.getArgument(0);
            StreamingChatResponseHandler handler = invocation.getArgument(1);
            @SuppressWarnings("unchecked") Consumer<ToolCallProgress> progress = invocation.getArgument(3);
            providerRequests.add(mapper.toProviderRequest(request, "test-model", 256));
            int index = responseIndex.getAndIncrement();
            List<Call> responseCalls = responses.get(index);
            if (responseCalls.size() == 1 && EMPTY_STOP.equals(responseCalls.getFirst().name())) {
                reasoningSink.get().accept("private provider reasoning");
                handler.onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from(""))
                        .finishReason(FinishReason.STOP).build());
                return null;
            }
            if (responseCalls.size() == 1 && PROVIDER_FAILURE.equals(responseCalls.getFirst().name())) {
                handler.onError(new com.auralis.app.shared.error.DomainException(
                        "MODEL_PROVIDER_ERROR", "synthetic provider failure"));
                return null;
            }
            if (responseCalls.size() == 1 && CANCEL.equals(responseCalls.getFirst().name())) {
                cancellation.get().cancel();
                handler.onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from(""))
                        .finishReason(FinishReason.STOP).build());
                return null;
            }
            if (responseCalls.isEmpty()) {
                handler.onPartialResponse(new PartialResponse("Done."), mock(PartialResponseContext.class));
                handler.onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from("Done."))
                        .finishReason(FinishReason.STOP).build());
                return null;
            }
            List<ToolExecutionRequest> requests = new ArrayList<>();
            for (int callIndex = 0; callIndex < responseCalls.size(); callIndex++) {
                Call call = responseCalls.get(callIndex);
                ToolExecutionRequest toolRequest = ToolExecutionRequest.builder().id(call.id())
                        .name(call.name()).arguments(call.arguments()).build();
                requests.add(toolRequest);
                progress.accept(new ToolCallProgress("response-" + index, callIndex, call.id(), call.name(), call.arguments()));
                handler.onCompleteToolCall(new CompleteToolCall(callIndex, toolRequest));
            }
            handler.onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from(requests))
                    .finishReason(FinishReason.TOOL_EXECUTION).build());
            return null;
        }).when(adapter).chatWithRawCapture(any(ChatRequest.class), any(StreamingChatResponseHandler.class),
                any(Consumer.class), any(Consumer.class));

        AuralisProperties runtimeProperties = mock(AuralisProperties.class);
        AuralisProperties.Ai runtimeAiProperties = mock(AuralisProperties.Ai.class);
        when(runtimeProperties.ai()).thenReturn(runtimeAiProperties);
        when(runtimeAiProperties.maxPromptChars()).thenReturn(50_000);
        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, new ChatAgentProperties(0, 0, maxIterations, 12,
                        65_536, 524_288, 300), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), runtimeProperties);
        orchestrator.executeAdmission(userId,
                new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false), "request", null,
                events::add);
        return new TestRun(providerRequests, events, finishedStatus, partsJson, persistence, tools);
    }

    private record Call(String id, String name, String arguments) {}
    private record TestRun(List<AiProviderRequest> providerRequests, List<ChatSseEnvelope> events,
                           AtomicReference<String> finishedStatus, AtomicReference<String> partsJson,
                           ChatRuntimePersistenceService persistence, ChatReadTools tools) {}
}

