package com.auralis.app.ai.usage;

/** All-time auditable totals for one credential source; actual fields are null if any dispatched usage is unknown. */
public record AiUsageTotals(Long actualInputTokens, Long actualOutputTokens,
                            long unknownDispatchedCalls, long chargedTokens, long reservedTokens,
                            long reservedCalls, long calls) { }
