package com.auralis.app.ai.usage;

public record AiTokenUsage(Long inputTokens, Long outputTokens) {

    public AiTokenUsage {
        if ((inputTokens != null && inputTokens < 0) || (outputTokens != null && outputTokens < 0)) {
            throw new IllegalArgumentException("Provider token usage cannot be negative");
        }
    }
}
