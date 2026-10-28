package com.auralis.app.ai.usage;

import java.util.Map;
import java.util.UUID;

/** Aggregated ledger view for an owner-verified actual task id and approved operation set. */
public record AiTaskUsageSnapshot(UUID taskId, Map<String, AiUsageTotals> groups) {
    public AiTaskUsageSnapshot { groups = Map.copyOf(groups); }
}
