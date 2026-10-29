package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderRequestValidator;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderToolCall;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiOutputRole;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.shared.error.DomainException;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.CompleteToolCall;
import dev.langchain4j.model.chat.response.PartialResponse;
import dev.langchain4j.model.chat.response.PartialResponseContext;
import dev.langchain4j.model.chat.response.PartialToolCall;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.chat.response.StreamingHandle;
import dev.langchain4j.model.output.FinishReason;
import dev.langchain4j.model.output.TokenUsage;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

/** One-run LangChain4j model facade; every call is exactly one Gateway invocation. */
public final class ChatAgentModelAdapter implements StreamingChatModel, AutoCloseable {
    private final ChatAgentRunContext context;
    private final AiTaskScope scope;
    private final AiChatRequestMapper mapper;
    private final ChatAgentProperties properties;
    private final int maxOutputTokens;
    private final long responseTimeoutMillis;
    private final AtomicBoolean closed = new AtomicBoolean();

    ChatAgentModelAdapter(ChatAgentRunContext context, AiTaskScope scope, AiChatRequestMapper mapper,
                          ChatAgentProperties properties, int maxOutputTokens, long responseTimeoutMillis) {
        this.context = Objects.requireNonNull(context);
        this.scope = Objects.requireNonNull(scope);
        this.mapper = Objects.requireNonNull(mapper);
        this.properties = Objects.requireNonNull(properties);
        this.maxOutputTokens = maxOutputTokens;
        this.responseTimeoutMillis = responseTimeoutMillis;
        if (!scope.taskId().equals(AiTaskContext.chatAgentLedgerTaskId(context.userId(), context.runId()))) {
            throw new IllegalArgumentException("Gateway task identity does not match the logical Chat run");
        }
    }

    public ChatResponse completeChat(ChatRequest request) {
        requireOpen();
        try {
            AiProviderRequest mapped = mapper.toProviderRequest(request, context.model(), maxOutputTokens);
            AiInvocationResult<AiProviderResponse> invocation = scope.completeChat(AiStage.CHAT_COMPLETION,
                    context.provider(), mapped, context.credential(), context.credentialSource(),
                    responseTimeoutMillis, context.cancellation());
            AiProviderResponse response = invocation.value();
            validateTerminal(response.finishReason(), response.toolCalls());
            return toSdkResponse(response.content(), response.toolCalls(), response.inputTokens(),
                    response.outputTokens(), response.finishReason());
        } catch (RuntimeException exception) {
            throw exception;
        }
    }

    @Override
    public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
        Objects.requireNonNull(handler);
        requireOpen();
        StreamAccumulator accumulator = new StreamAccumulator(request, handler);
        try {
            AiProviderRequest mapped = mapper.toProviderRequest(request, context.model(), maxOutputTokens);
            scope.stream(AiStage.CHAT_COMPLETION, context.provider(), mapped, context.credential(),
                    context.credentialSource(), context.cancellation(), accumulator::accept);
            accumulator.finish();
        } catch (Throwable exception) {
            accumulator.fail(exception);
        }
    }

    private ChatResponse toSdkResponse(String content, List<AiProviderToolCall> calls,
                                       Long inputTokens, Long outputTokens, String finishReason) {
        List<ToolExecutionRequest> toolRequests = calls.stream().map(call ->
                ToolExecutionRequest.builder().id(call.id()).name(call.name()).arguments(call.argumentsJson()).build())
                .toList();
        AiMessage message = toolRequests.isEmpty()
                ? AiMessage.from(content == null ? "" : content)
                : content == null || content.isEmpty()
                        ? AiMessage.from(toolRequests) : AiMessage.from(content, toolRequests);
        ChatResponse.Builder result = ChatResponse.builder().aiMessage(message)
                .modelName(context.model()).finishReason(finishReason(finishReason));
        TokenUsage usage = tokenUsage(inputTokens, outputTokens);
        if (usage != null) result.tokenUsage(usage);
        return result.build();
    }

    private TokenUsage tokenUsage(Long input, Long output) {
        if (input == null && output == null) return null;
        return new TokenUsage(toCount(input), toCount(output));
    }

    private Integer toCount(Long value) {
        if (value == null) return null;
        if (value < 0 || value > Integer.MAX_VALUE) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned invalid usage");
        }
        return value.intValue();
    }

    private FinishReason finishReason(String reason) {
        return switch (reason == null ? "other" : reason) {
            case "stop" -> FinishReason.STOP;
            case "tool_calls" -> FinishReason.TOOL_EXECUTION;
            case "length" -> FinishReason.LENGTH;
            case "content_filter" -> FinishReason.CONTENT_FILTER;
            default -> FinishReason.OTHER;
        };
    }

    private void validateTerminal(String reason, List<AiProviderToolCall> calls) {
        if (!"stop".equals(reason) && !"tool_calls".equals(reason)) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned a non-executable terminal");
        }
        if (calls != null && !calls.isEmpty() && !"tool_calls".equals(reason)) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid tool-call terminal");
        }
        if ("tool_calls".equals(reason) && (calls == null || calls.isEmpty())) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned no complete tool calls");
        }
    }

    private void requireOpen() {
        if (closed.get() || context.cancellation().isCancelled()) {
            throw new IllegalStateException("Chat Agent model adapter is closed or cancelled");
        }
    }

    @Override
    public void close() {
        if (closed.compareAndSet(false, true)) scope.close();
    }

    private final class StreamAccumulator {
        private final ChatRequest request;
        private final StreamingChatResponseHandler handler;
        private final StreamingHandle handle = new StreamingHandle() {
            @Override public void cancel() { context.cancellation().cancel(); }
            @Override public boolean isCancelled() { return context.cancellation().isCancelled(); }
        };
        private final PartialResponseContext partialContext = new PartialResponseContext(handle);
        private final Map<Integer, ToolAccumulator> calls = new HashMap<>();
        private final AtomicBoolean terminalCallback = new AtomicBoolean();
        private String responseId;
        private String finishReason;
        private Long inputTokens;
        private Long outputTokens;
        private StringBuilder text;

        private StreamAccumulator(ChatRequest request, StreamingChatResponseHandler handler) {
            this.request = request;
            this.handler = handler;
        }

        private void accept(AiProviderChunk chunk) {
            if (chunk == null || handle.isCancelled()) return;
            if (chunk.responseId() != null) {
                if (responseId == null) responseId = chunk.responseId();
                else if (!responseId.equals(chunk.responseId())) invalidStream();
            }
            if (chunk.content() != null && !chunk.content().isEmpty()) {
                if (text == null) text = new StringBuilder();
                text.append(chunk.content());
                handler.onPartialResponse(new PartialResponse(chunk.content()), partialContext);
            }
            if (chunk.toolCallDelta() != null) acceptToolDelta(chunk);
            if (chunk.usage() != null) {
                inputTokens = chunk.usage().inputTokens();
                outputTokens = chunk.usage().outputTokens();
            }
            if (chunk.terminal()) {
                if (terminalCallback.get()) invalidStream();
                finishReason = chunk.finishReason();
            }
        }

        private void acceptToolDelta(AiProviderChunk chunk) {
            if (chunk.responseId() == null || chunk.toolIndex() == null || chunk.toolIndex() < 0
                    || chunk.toolIndex() >= properties.maxToolCalls()) invalidStream();
            ToolAccumulator call = calls.computeIfAbsent(chunk.toolIndex(), ignored -> new ToolAccumulator());
            var delta = chunk.toolCallDelta();
            if (delta.id() != null) {
                if (call.id != null && !call.id.equals(delta.id())) invalidStream();
                call.id = delta.id();
            }
            if (delta.name() != null) call.name.append(delta.name());
            if (delta.argumentsFragment() != null) call.arguments.append(delta.argumentsFragment());
            handler.onPartialToolCall(PartialToolCall.builder().index(chunk.toolIndex())
                    .id(call.id).name(call.name.toString()).partialArguments(call.arguments.toString()).build());
        }

        private void finish() {
            if (terminalCallback.get() || handle.isCancelled()) {
                if (!terminalCallback.get()) fail(new IllegalStateException("Chat Agent provider stream was cancelled"));
                return;
            }
            try {
                List<AiProviderToolCall> completeCalls = completeCalls();
                validateTerminal(finishReason, completeCalls);
                for (int index = 0; index < completeCalls.size(); index++) {
                    AiProviderToolCall call = completeCalls.get(index);
                    ToolExecutionRequest execution = ToolExecutionRequest.builder().id(call.id())
                            .name(call.name()).arguments(call.argumentsJson()).build();
                    handler.onCompleteToolCall(new CompleteToolCall(index, execution));
                }
                if (!terminalCallback.compareAndSet(false, true)) return;
                handler.onCompleteResponse(toSdkResponse(text == null ? "" : text.toString(),
                        completeCalls, inputTokens, outputTokens, finishReason));
            } catch (Throwable exception) {
                fail(exception);
            }
        }

        private List<AiProviderToolCall> completeCalls() {
            if (calls.isEmpty()) return List.of();
            int max = calls.keySet().stream().mapToInt(Integer::intValue).max().orElse(-1);
            if (max + 1 != calls.size()) invalidStream();
            List<AiProviderToolCall> complete = new ArrayList<>();
            HashSet<String> ids = new HashSet<>();
            List<ToolSpecification> definitions = request.toolSpecifications();
            for (int index = 0; index <= max; index++) {
                ToolAccumulator parts = calls.get(index);
                if (parts.id == null || parts.name.isEmpty() || parts.arguments.isEmpty()
                        || !ids.add(parts.id.toString())) invalidStream();
                String name = parts.name.toString();
                if (definitions.stream().noneMatch(tool -> tool.name().equals(name))) invalidStream();
                String arguments = parts.arguments.toString();
                AiProviderRequestValidator.requireObject(arguments);
                complete.add(new AiProviderToolCall(parts.id, name, arguments));
            }
            return List.copyOf(complete);
        }

        private void fail(Throwable error) {
            if (terminalCallback.compareAndSet(false, true)) handler.onError(error);
        }

        private void invalidStream() {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid tool stream");
        }
    }

    private static final class ToolAccumulator {
        private String id;
        private final StringBuilder name = new StringBuilder();
        private final StringBuilder arguments = new StringBuilder();
    }
}
