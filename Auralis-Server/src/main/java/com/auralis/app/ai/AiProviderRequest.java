package com.auralis.app.ai;

import java.util.List;
import java.util.Objects;

public record AiProviderRequest(
        String model,
        List<Message> messages,
        List<AiProviderToolDefinition> tools,
        Double temperature,
        Integer maxTokens,
        boolean structuredJson,
        boolean overviewCapacityRequest,
        long overviewResponseByteLimit,
        Boolean thinkingEnabled) {

    /** The Gateway sets this transport-only marker after enforcing Overview policy. */
    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson) {
        this(model, messages, List.of(), temperature, maxTokens, structuredJson, false, 0, null);
    }

    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson, boolean overviewCapacityRequest) {
        this(model, messages, List.of(), temperature, maxTokens, structuredJson, overviewCapacityRequest, 0, null);
    }

    public AiProviderRequest(String model, List<Message> messages,
                             Double temperature, Integer maxTokens) {
        this(model, messages, List.of(), temperature, maxTokens, false, false, 0, null);
    }

    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson, boolean overviewCapacityRequest,
                             long overviewResponseByteLimit) {
        this(model, messages, List.of(), temperature, maxTokens, structuredJson,
                overviewCapacityRequest, overviewResponseByteLimit, null);
    }

    public AiProviderRequest(String model, List<Message> messages, List<AiProviderToolDefinition> tools,
                             Double temperature, Integer maxTokens, boolean structuredJson,
                             boolean overviewCapacityRequest, long overviewResponseByteLimit) {
        this(model, messages, tools, temperature, maxTokens, structuredJson,
                overviewCapacityRequest, overviewResponseByteLimit, null);
    }

    public AiProviderRequest {
        messages = List.copyOf(messages);
        tools = tools == null ? List.of() : List.copyOf(tools);
        AiProviderRequestValidator.validate(messages, tools);
    }

    public AiProviderRequest withMaxTokens(int maxTokens) {
        return new AiProviderRequest(model, messages, tools, temperature, maxTokens, structuredJson,
                overviewCapacityRequest, overviewResponseByteLimit, thinkingEnabled);
    }

    public AiProviderRequest withThinkingEnabled(Boolean enabled) {
        return new AiProviderRequest(model, messages, tools, temperature, maxTokens, structuredJson,
                overviewCapacityRequest, overviewResponseByteLimit, enabled);
    }

    public record Message(AiMessageRole role, String content, List<AiProviderToolCall> toolCalls,
                          String toolCallId, String toolName, String reasoningContent) {
        public Message(AiMessageRole role, String content) {
            this(role, content, List.of(), null, null, null);
        }

        public Message(AiMessageRole role, String content, List<AiProviderToolCall> toolCalls,
                       String toolCallId, String toolName) {
            this(role, content, toolCalls, toolCallId, toolName, null);
        }

        public Message {
            Objects.requireNonNull(role, "role");
            toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
            if ((role == AiMessageRole.SYSTEM || role == AiMessageRole.USER)
                    && (!toolCalls.isEmpty() || toolCallId != null || toolName != null || reasoningContent != null)) {
                throw new IllegalArgumentException("System and user messages cannot carry tool fields");
            }
            if (role == AiMessageRole.ASSISTANT && (toolCallId != null || toolName != null)) {
                throw new IllegalArgumentException("Assistant messages cannot carry a tool result identity");
            }
            if (role == AiMessageRole.ASSISTANT && reasoningContent != null && toolCalls.isEmpty()) {
                throw new IllegalArgumentException("Assistant reasoning requires a tool-call message");
            }
            if (role == AiMessageRole.TOOL && (toolCallId == null || toolCallId.isBlank() || !toolCalls.isEmpty()
                    || reasoningContent != null)) {
                throw new IllegalArgumentException("Tool messages require one tool call id and no tool calls");
            }
            if (role == AiMessageRole.TOOL && content == null) {
                throw new IllegalArgumentException("Tool result content is required");
            }
            if (role != AiMessageRole.TOOL && content == null && toolCalls.isEmpty()) {
                throw new IllegalArgumentException("Message content is required unless the assistant has tool calls");
            }
        }
    }
}
