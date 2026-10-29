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
        long overviewResponseByteLimit) {

    /** The Gateway sets this transport-only marker after enforcing Overview policy. */
    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson) {
        this(model, messages, List.of(), temperature, maxTokens, structuredJson, false, 0);
    }

    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson, boolean overviewCapacityRequest) {
        this(model, messages, List.of(), temperature, maxTokens, structuredJson, overviewCapacityRequest, 0);
    }

    public AiProviderRequest(String model, List<Message> messages,
                             Double temperature, Integer maxTokens) {
        this(model, messages, List.of(), temperature, maxTokens, false, false, 0);
    }

    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson, boolean overviewCapacityRequest,
                             long overviewResponseByteLimit) {
        this(model, messages, List.of(), temperature, maxTokens, structuredJson,
                overviewCapacityRequest, overviewResponseByteLimit);
    }

    public AiProviderRequest {
        messages = List.copyOf(messages);
        tools = tools == null ? List.of() : List.copyOf(tools);
        AiProviderRequestValidator.validate(messages, tools);
    }

    public record Message(AiMessageRole role, String content, List<AiProviderToolCall> toolCalls,
                          String toolCallId, String toolName) {
        public Message(AiMessageRole role, String content) {
            this(role, content, List.of(), null, null);
        }

        public Message {
            Objects.requireNonNull(role, "role");
            toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
            if ((role == AiMessageRole.SYSTEM || role == AiMessageRole.USER)
                    && (!toolCalls.isEmpty() || toolCallId != null || toolName != null)) {
                throw new IllegalArgumentException("System and user messages cannot carry tool fields");
            }
            if (role == AiMessageRole.ASSISTANT && (toolCallId != null || toolName != null)) {
                throw new IllegalArgumentException("Assistant messages cannot carry a tool result identity");
            }
            if (role == AiMessageRole.TOOL && (toolCallId == null || toolCallId.isBlank() || !toolCalls.isEmpty())) {
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
