package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderToolCall;
import com.auralis.app.ai.AiProviderToolCallDelta;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiOutputRole;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.ChatAgentProperties;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.CompleteToolCall;
import dev.langchain4j.model.chat.response.PartialToolCall;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.ArrayList;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatAgentModelAdapterTests {
    @Test
    void emitsCompleteToolRequestOnlyAfterNormalStreamTerminal() {
        TestCancellation cancellation = new TestCancellation();
        TestScope scope = new TestScope(cancellation, false);
        ChatAgentModelAdapter adapter = adapter(scope, cancellation);
        List<CompleteToolCall> completeCalls = new ArrayList<>();
        List<PartialToolCall> partialCalls = new ArrayList<>();
        List<ChatResponse> responses = new ArrayList<>();

        adapter.doChat(request(), new StreamingChatResponseHandler() {
            @Override public void onCompleteResponse(ChatResponse response) { responses.add(response); }
            @Override public void onError(Throwable error) { throw new AssertionError(error); }
            @Override public void onPartialToolCall(PartialToolCall partial) { partialCalls.add(partial); }
            @Override public void onCompleteToolCall(CompleteToolCall complete) { completeCalls.add(complete); }
        });

        assertEquals(2, partialCalls.size());
        assertEquals(1, completeCalls.size());
        assertEquals("call-1", completeCalls.getFirst().toolExecutionRequest().id());
        assertEquals(1, responses.size());
        assertTrue(responses.getFirst().aiMessage().hasToolExecutionRequests());
        assertEquals("lookup", responses.getFirst().aiMessage().toolExecutionRequests().getFirst().name());
    }

    @Test
    void refusesCompleteToolRequestForLengthTerminal() {
        TestCancellation cancellation = new TestCancellation();
        TestScope scope = new TestScope(cancellation, true);
        ChatAgentModelAdapter adapter = adapter(scope, cancellation);
        AtomicBoolean completedTool = new AtomicBoolean();
        AtomicBoolean failed = new AtomicBoolean();

        adapter.doChat(request(), new StreamingChatResponseHandler() {
            @Override public void onCompleteResponse(ChatResponse response) { throw new AssertionError("unexpected completion"); }
            @Override public void onError(Throwable error) { failed.set(true); }
            @Override public void onCompleteToolCall(CompleteToolCall complete) { completedTool.set(true); }
        });

        assertTrue(failed.get());
        assertTrue(!completedTool.get());
    }

    @Test
    void synchronousMappingPreservesCallIdentityAndUsage() {
        TestCancellation cancellation = new TestCancellation();
        TestScope scope = new TestScope(cancellation, false);
        ChatAgentModelAdapter adapter = adapter(scope, cancellation);

        ChatResponse response = adapter.completeChat(request());

        assertTrue(response.aiMessage().hasToolExecutionRequests());
        assertEquals("call-1", response.aiMessage().toolExecutionRequests().getFirst().id());
        assertEquals(4, response.tokenUsage().inputTokenCount());
        assertEquals(3, response.tokenUsage().outputTokenCount());
    }

    @Test
    void streamsReasoningSeparatelyAndMapsItBackOnlyWithItsToolCall() {
        TestCancellation cancellation = new TestCancellation();
        TestScope scope = new TestScope(cancellation, false, "Use the authorized lookup tool.");
        List<String> reasoningDeltas = new ArrayList<>();
        ChatAgentModelAdapter adapter = adapter(scope, cancellation, reasoningDeltas::add);
        List<ChatResponse> responses = new ArrayList<>();

        adapter.doChat(request(), new StreamingChatResponseHandler() {
            @Override public void onCompleteResponse(ChatResponse response) { responses.add(response); }
            @Override public void onError(Throwable error) { throw new AssertionError(error); }
        });

        assertEquals(List.of("Use the authorized lookup tool."), reasoningDeltas);
        AiProviderRequest mapped = adapter.mapRequest(ChatRequest.builder()
                .messages(List.of(responses.getFirst().aiMessage(),
                        ToolExecutionResultMessage.from("call-1", "lookup", "{}")))
                .toolSpecifications(request().toolSpecifications()).build());
        assertEquals("Use the authorized lookup tool.", mapped.messages().getFirst().reasoningContent());
    }

    @Test
    void rawContentSinkReceivesProviderDeltaBeforeParserHandler() {
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(new TestScope(cancellation, false), cancellation);
        List<String> order = new ArrayList<>();

        adapter.chatWithRawCapture(request(), new StreamingChatResponseHandler() {
            @Override public void onPartialResponse(dev.langchain4j.model.chat.response.PartialResponse partial,
                    dev.langchain4j.model.chat.response.PartialResponseContext context) {
                order.add("handler:" + partial.text());
            }
            @Override public void onCompleteResponse(ChatResponse response) { }
            @Override public void onError(Throwable error) { throw new AssertionError(error); }
        }, content -> order.add("raw:" + content));

        assertEquals(List.of("raw:text", "handler:text"), order.subList(0, 2));
    }

    private ChatAgentModelAdapter adapter(TestScope scope, TestCancellation cancellation) {
        return adapter(scope, cancellation, ignored -> { });
    }

    private ChatAgentModelAdapter adapter(TestScope scope, TestCancellation cancellation,
                                          Consumer<String> reasoningSink) {
        UUID userId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        UUID budgetTaskId = runId;
        ChatAgentRunContext context = new ChatAgentRunContext(userId, runId, UUID.randomUUID(), budgetTaskId,
                1L, AiProviderType.OPENAI_COMPATIBLE, "test-model", new AiCredential("https://example.com", "key"),
                AiCredentialSource.PLATFORM, cancellation);
        scope.id = AiTaskContext.chatAgentLedgerTaskId(userId, runId);
        assertEquals(runId, context.budgetTaskId());
        assertEquals(AiTaskContext.chatAgentLedgerTaskId(userId, runId), scope.taskId());
        return new ChatAgentModelAdapter(context, scope, new AiChatRequestMapper(new ObjectMapper()),
                ChatAgentProperties.defaults(), 4096, 10_000, reasoningSink);
    }

    private ChatRequest request() {
        ToolSpecification tool = ToolSpecification.builder().name("lookup")
                .description("Look up authorized content")
                .parameters(JsonObjectSchema.builder().build()).build();
        return ChatRequest.builder().modelName("test-model")
                .messages(UserMessage.from("find"))
                .toolSpecifications(tool).build();
    }

    private static final class TestScope implements AiTaskScope {
        private final TestCancellation cancellation;
        private final boolean lengthTerminal;
        private final String reasoningContent;
        private UUID id;

        private TestScope(TestCancellation cancellation, boolean lengthTerminal) {
            this(cancellation, lengthTerminal, null);
        }

        private TestScope(TestCancellation cancellation, boolean lengthTerminal, String reasoningContent) {
            this.cancellation = cancellation;
            this.lengthTerminal = lengthTerminal;
            this.reasoningContent = reasoningContent;
        }

        @Override public UUID taskId() { return id; }
        @Override public AiProviderUsage usage() { return new AiProviderUsage(1, 1, 1L, 1L, 2, true); }
        @Override public AiProviderUsage usage(AiCredentialSource source) { return usage(); }
        @Override public void close() { }

        @Override
        public AiInvocationResult<AiProviderResponse> completeChat(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                long responseTimeoutMillis, AiProviderCallCancellation cancellation) {
            return new AiInvocationResult<>(new AiProviderResponse("", 4L, 3L, "tool_calls",
                    AiProviderModelIdentity.missing(), List.of(new AiProviderToolCall(
                    "call-1", "lookup", "{\"q\":\"x\"}"))), usage());
        }

        @Override
        public AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                AiProviderCallCancellation callCancellation, java.util.function.Consumer<AiProviderChunk> sink) {
            sink.accept(new AiProviderChunk("text", false, null, AiProviderModelIdentity.missing()));
            if (reasoningContent != null) {
                sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(),
                        null, null, null, null, false, reasoningContent));
            }
            sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), "resp-1", 0,
                    new AiProviderToolCallDelta("call-1", "lookup", "{\"q\":"), null, false));
            sink.accept(new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), "resp-1", 0,
                    new AiProviderToolCallDelta(null, null, "\"x\"}"), null, false));
            sink.accept(new AiProviderChunk("", true, null, AiProviderModelIdentity.missing(), "resp-1", null,
                    null, lengthTerminal ? "length" : "tool_calls", true));
            return new AiInvocationResult<>(null, usage());
        }
    }

    private static final class TestCancellation implements AiProviderCallCancellation {
        private final AtomicBoolean cancelled = new AtomicBoolean();
        @Override public boolean isCancelled() { return cancelled.get(); }
        @Override public boolean cancel() { return cancelled.compareAndSet(false, true); }
        @Override public Registration onCancel(Runnable listener) {
            if (isCancelled()) listener.run();
            return () -> { };
        }
    }
}
