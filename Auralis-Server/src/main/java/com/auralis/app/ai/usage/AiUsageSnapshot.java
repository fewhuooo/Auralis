package com.auralis.app.ai.usage;

import java.time.Instant;
import java.util.Map;

public record AiUsageSnapshot(Window hourly, Window daily, Map<AiCredentialSource, AiUsageTotals> allCalls) {

    public AiUsageSnapshot(Window hourly, Window daily) {
        this(hourly, daily, Map.of());
    }

    public AiUsageSnapshot {
        allCalls = Map.copyOf(allCalls);
    }

    public record Window(long limitTokens, long chargedTokens, long reservedTokens,
                         long remainingTokens, Instant resetAt) {
    }
}
