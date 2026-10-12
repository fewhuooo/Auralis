package com.auralis.app.ai.usage;

import java.time.Instant;

public record AiUsageSnapshot(Window hourly, Window daily) {

    public record Window(long limitTokens, long chargedTokens, long reservedTokens,
                         long remainingTokens, Instant resetAt) {
    }
}
