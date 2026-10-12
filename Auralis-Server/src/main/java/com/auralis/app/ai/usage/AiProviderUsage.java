package com.auralis.app.ai.usage;

public record AiProviderUsage(
        long estimatedInputTokens,
        long reservedOutputTokens,
        Long actualInputTokens,
        Long actualOutputTokens,
        long chargedTokens,
        boolean providerUsageComplete) {

    public AiProviderUsage {
        if (estimatedInputTokens < 0 || reservedOutputTokens < 0 || chargedTokens < 0
                || (actualInputTokens != null && actualInputTokens < 0)
                || (actualOutputTokens != null && actualOutputTokens < 0)) {
            throw new IllegalArgumentException("Usage token counts cannot be negative");
        }
    }
}
