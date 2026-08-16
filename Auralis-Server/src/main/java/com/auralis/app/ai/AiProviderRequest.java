package com.auralis.app.ai;

import java.util.List;

public record AiProviderRequest(
        String model,
        List<Message> messages,
        Double temperature,
        Integer maxTokens) {

    public AiProviderRequest {
        messages = List.copyOf(messages);
    }

    public record Message(AiMessageRole role, String content) {
    }
}
