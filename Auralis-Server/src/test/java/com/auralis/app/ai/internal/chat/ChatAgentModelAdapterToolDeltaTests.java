package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderToolCallDelta;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.usage.ChatAgentProperties;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.UserMessage;
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
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

class ChatAgentModelAdapterToolDeltaTests {

    @Test
    void emitsLosslessProgressForEveryDeltaWithoutWaitingForSdkPartialFields() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        List<ToolCallProgress> progress = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", null, null),
                toolDelta(1, null, null, "{\"chart\":{\"label\":\"é🙂\"}}"),
                toolDelta(0, null, "list_", null),
                toolDelta(1, "call-1", "render_chart", null),
                toolDelta(0, null, "sources", "{\"q\":\""),
                toolDelta(0, null, null, "中\"}"),
                terminal("tool_calls")));

        adapter.chatWithRawCapture(requestWithRenderedTools(), handler(partials, completed, failures),
                ignored -> { }, progress::add);

        assertThat(failures).isEmpty();
        assertThat(progress).containsExactly(
                new ToolCallProgress("response-0", 0, "call-0", "", null),
                new ToolCallProgress("response-0", 1, null, "", "{\"chart\":{\"label\":\"é🙂\"}}"),
                new ToolCallProgress("response-0", 0, "call-0", "list_", null),
                new ToolCallProgress("response-0", 1, "call-1", "render_chart", null),
                new ToolCallProgress("response-0", 0, "call-0", "list_sources", "{\"q\":\""),
                new ToolCallProgress("response-0", 0, "call-0", "list_sources", "中\"}"));
        assertThat(completed).hasSize(2);
        assertThat(completed).extracting(call -> call.toolExecutionRequest().name())
                .containsExactly("list_sources", "render_chart");
    }

    @Test
    void acceptsIdOnlyFirstToolDeltaAndCompletesOnlyAtToolCallsTerminal() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", null, null),
                toolDelta(0, null, "lookup", "{"),
                toolDelta(0, null, null, "\"q\":\"one\"}"),
                terminal("tool_calls")));

        adapter.doChat(request(), handler(partials, completed, failures));

        assertThat(failures).isEmpty();
        assertThat(completed).hasSize(1);
        assertThat(completed.getFirst().toolExecutionRequest().id()).isEqualTo("call-0");
        assertThat(partials).allSatisfy(partial -> {
            assertThat(partial.name()).isEqualTo("lookup");
            assertThat(partial.partialArguments()).isNotEmpty();
        });
    }

    @Test
    void accumulatesArgumentsThatArriveBeforeToolName() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", null, "{"),
                toolDelta(0, null, "lookup", "\"q\":\"two\"}"),
                terminal("tool_calls")));

        adapter.doChat(request(), handler(partials, completed, failures));

        assertThat(failures).isEmpty();
        assertThat(completed).hasSize(1);
        assertThat(completed.getFirst().toolExecutionRequest().arguments()).isEqualTo("{\"q\":\"two\"}");
        assertThat(partials).allSatisfy(partial -> assertThat(partial.name()).isEqualTo("lookup"));
    }

    @Test
    void buffersIndependentParallelToolCallDeltasByIndex() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", null, "{"),
                toolDelta(1, "call-1", null, "{"),
                toolDelta(1, null, "lookup", "\"q\":\"b\"}"),
                toolDelta(0, null, "lookup", "\"q\":\"a\"}"),
                terminal("tool_calls")));

        adapter.doChat(request(), handler(partials, completed, failures));

        assertThat(failures).isEmpty();
        assertThat(completed).hasSize(2);
        assertThat(completed).extracting(call -> call.toolExecutionRequest().id())
                .containsExactly("call-0", "call-1");
        assertThat(partials).allSatisfy(partial -> {
            assertThat(partial.name()).isEqualTo("lookup");
            assertThat(partial.partialArguments()).isNotEmpty();
        });
    }

    @Test
    void invalidTerminalNeverExecutesAccumulatedToolCall() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        List<ToolCallProgress> progress = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", null, "{"),
                toolDelta(0, null, "lookup", "\"q\":\"three\"}"),
                terminal("length")));

        adapter.chatWithRawCapture(request(), handler(partials, completed, failures), ignored -> { }, progress::add);

        assertThat(failures).hasSize(1);
        assertThat(completed).isEmpty();
        assertThat(progress).hasSize(2);
        assertThat(progress.getLast()).isEqualTo(
                new ToolCallProgress("response-0", 0, "call-0", "lookup", "\"q\":\"three\"}"));
    }

    @Test
    void lengthFinishReasonCannotBeReplacedByToolCallsTerminal() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter adapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", "lookup", "{\"q\":\"x\"}"),
                terminal("length"),
                terminal("tool_calls")));

        adapter.doChat(request(), handler(partials, completed, failures));

        assertThat(failures).hasSize(1);
        assertThat(completed).isEmpty();
    }

    @Test
    void toolDeltaAfterFinishReasonCannotExecuteAndUsageOnlyTailRemainsAllowed() {
        List<PartialToolCall> partials = new ArrayList<>();
        List<CompleteToolCall> completed = new ArrayList<>();
        List<Throwable> failures = new ArrayList<>();
        TestCancellation cancellation = new TestCancellation();
        ChatAgentModelAdapter rejectedAdapter = adapter(cancellation, List.of(
                toolDelta(0, "call-0", "lookup", "{\"q\":\"x\"}"),
                finishReason("tool_calls"),
                toolDelta(0, null, null, " "),
                terminal("tool_calls")));

        rejectedAdapter.doChat(request(), handler(partials, completed, failures));

        assertThat(failures).hasSize(1);
        assertThat(completed).isEmpty();

        List<Throwable> normalFailures = new ArrayList<>();
        ChatAgentModelAdapter normalAdapter = adapter(new TestCancellation(), List.of(
                finishReason("stop"),
                new AiProviderChunk("", false, new AiTokenUsage(1L, 1L), AiProviderModelIdentity.missing(),
                        "response-0", null, null, null, false),
                terminal("stop")));

        normalAdapter.doChat(request(), handler(new ArrayList<>(), new ArrayList<>(), normalFailures));

        assertThat(normalFailures).isEmpty();
    }

    private ChatAgentModelAdapter adapter(TestCancellation cancellation, List<AiProviderChunk> chunks) {
        UUID userId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        ChatAgentRunContext context = new ChatAgentRunContext(userId, runId, UUID.randomUUID(), runId,
                1L, AiProviderType.OPENAI_COMPATIBLE, "test-model", new AiCredential("https://example.com", "key"),
                AiCredentialSource.PLATFORM, cancellation);
        TestScope scope = new TestScope(AiTaskContext.chatAgentLedgerTaskId(userId, runId), chunks);
        return new ChatAgentModelAdapter(context, scope, new AiChatRequestMapper(new ObjectMapper()),
                ChatAgentProperties.defaults(), 4096, 10_000);
    }

    private ChatRequest request() {
        return requestWithTools("lookup");
    }

    private ChatRequest requestWithRenderedTools() {
        return requestWithTools("list_sources", "render_chart");
    }

    private ChatRequest requestWithTools(String... names) {
        List<ToolSpecification> tools = java.util.Arrays.stream(names).map(name -> ToolSpecification.builder().name(name)
                .description("Look up authorized content")
                .parameters(JsonObjectSchema.builder().build()).build()).toList();
        return ChatRequest.builder().modelName("test-model").messages(UserMessage.from("find"))
                .toolSpecifications(tools).build();
    }

    private StreamingChatResponseHandler handler(List<PartialToolCall> partials,
            List<CompleteToolCall> completed, List<Throwable> failures) {
        return new StreamingChatResponseHandler() {
            @Override public void onCompleteResponse(ChatResponse response) { }
            @Override public void onError(Throwable error) { failures.add(error); }
            @Override public void onPartialToolCall(PartialToolCall partial) { partials.add(partial); }
            @Override public void onCompleteToolCall(CompleteToolCall complete) { completed.add(complete); }
        };
    }

    private AiProviderChunk toolDelta(int index, String id, String name, String arguments) {
        return new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), "response-0", index,
                new AiProviderToolCallDelta(id, name, arguments), null, false);
    }

    private AiProviderChunk terminal(String finishReason) {
        return new AiProviderChunk("", true, null, AiProviderModelIdentity.missing(), "response-0", null,
                null, finishReason, true);
    }

    private AiProviderChunk finishReason(String finishReason) {
        return new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), "response-0", null,
                null, finishReason, false);
    }

    private static final class TestScope implements AiTaskScope {
        private final UUID taskId;
        private final List<AiProviderChunk> chunks;

        private TestScope(UUID taskId, List<AiProviderChunk> chunks) {
            this.taskId = taskId;
            this.chunks = chunks;
        }

        @Override public UUID taskId() { return taskId; }
        @Override public AiProviderUsage usage() { return new AiProviderUsage(1, 1, 1L, 1L, 2, true); }
        @Override public AiProviderUsage usage(AiCredentialSource source) { return usage(); }
        @Override public void close() { }

        @Override
        public AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                AiProviderCallCancellation cancellation, Consumer<AiProviderChunk> sink) {
            for (AiProviderChunk chunk : chunks) sink.accept(chunk);
            return new AiInvocationResult<>(null, usage());
        }
    }

    private static final class TestCancellation implements AiProviderCallCancellation {
        private final AtomicBoolean cancelled = new AtomicBoolean();
        @Override public boolean isCancelled() { return cancelled.get(); }
        @Override public boolean cancel() { return cancelled.compareAndSet(false, true); }
        @Override public Registration onCancel(Runnable listener) { return () -> { }; }
    }
}
