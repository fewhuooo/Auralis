package com.auralis.app.ai;

import java.util.List;

public record AiProviderRequest(
        String model,
        List<Message> messages,
        Double temperature,
        Integer maxTokens,
        boolean structuredJson) {

    public AiProviderRequest(String model, List<Message> messages,
                             Double temperature, Integer maxTokens) {
        this(model, messages, temperature, maxTokens, false);
    }

    public AiProviderRequest {
        messages = List.copyOf(messages);
    }

    public record Message(AiMessageRole role, String content) {
    }
}
