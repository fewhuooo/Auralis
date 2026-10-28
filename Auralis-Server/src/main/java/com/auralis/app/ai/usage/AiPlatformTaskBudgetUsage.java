package com.auralis.app.ai.usage;

/** Internal task-scoped platform budget occupancy used for admission preflight. */
public record AiPlatformTaskBudgetUsage(long calls, long chargedTokens, long reservedTokens) {
    public AiPlatformTaskBudgetUsage {
        if (calls < 0 || chargedTokens < 0 || reservedTokens < 0) {
            throw new IllegalArgumentException("Platform task budget usage cannot be negative");
        }
    }
}
