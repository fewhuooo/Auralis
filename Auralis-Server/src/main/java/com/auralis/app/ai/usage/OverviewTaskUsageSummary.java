package com.auralis.app.ai.usage;

/** Safe aggregate of reservation-ledger metrics for one owner- and feature-scoped Overview budget task. */
public record OverviewTaskUsageSummary(
        long estimatedInputTokens,
        long reservedOutputTokens,
        Long actualInputTokens,
        Long actualOutputTokens,
        long chargedTokens,
        long unknownDispatchedCalls,
        long activeDispatchedReservations,
        boolean providerUsageComplete) {

    public OverviewTaskUsageSummary {
        if (estimatedInputTokens < 0 || reservedOutputTokens < 0 || chargedTokens < 0
                || unknownDispatchedCalls < 0 || activeDispatchedReservations < 0
                || (actualInputTokens != null && actualInputTokens < 0)
                || (actualOutputTokens != null && actualOutputTokens < 0)) {
            throw new IllegalArgumentException("Usage summary counts cannot be negative");
        }
        if (providerUsageComplete && (unknownDispatchedCalls != 0 || activeDispatchedReservations != 0
                || actualInputTokens == null || actualOutputTokens == null)) {
            throw new IllegalArgumentException("Complete provider usage requires known usage for every dispatch");
        }
        if (!providerUsageComplete && (actualInputTokens != null || actualOutputTokens != null)) {
            throw new IllegalArgumentException("Incomplete provider usage cannot expose partial totals as complete totals");
        }
    }
}
