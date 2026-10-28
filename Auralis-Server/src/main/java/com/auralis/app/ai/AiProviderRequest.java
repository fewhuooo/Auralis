package com.auralis.app.ai;

import java.util.List;

public record AiProviderRequest(
        String model,
        List<Message> messages,
        Double temperature,
        Integer maxTokens,
        boolean structuredJson,
        boolean overviewCapacityRequest,
        long overviewResponseByteLimit) {

    /** The Gateway sets this transport-only marker after enforcing Overview policy. */
    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson) {
        this(model, messages, temperature, maxTokens, structuredJson, false, 0);
    }

    public AiProviderRequest(String model, List<Message> messages, Double temperature,
                             Integer maxTokens, boolean structuredJson, boolean overviewCapacityRequest) {
        this(model, messages, temperature, maxTokens, structuredJson, overviewCapacityRequest, 0);
    }

    public AiProviderRequest(String model, List<Message> messages,
                             Double temperature, Integer maxTokens) {
        this(model, messages, temperature, maxTokens, false, false, 0);
    }

    public AiProviderRequest {
        messages = List.copyOf(messages);
    }

    public record Message(AiMessageRole role, String content) {
    }
}
