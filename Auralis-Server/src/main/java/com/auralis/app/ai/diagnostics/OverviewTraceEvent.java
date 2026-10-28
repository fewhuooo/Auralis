package com.auralis.app.ai.diagnostics;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Immutable, allow-listed Overview trace snapshot. */
public record OverviewTraceEvent(
        int formatVersion,
        Instant at,
        String type,
        UUID ownerId,
        UUID runId,
        UUID requestId,
        UUID generationId,
        UUID jobId,
        UUID taskId,
        UUID reservationId,
        String step,
        Integer attempt,
        String outcome,
        Map<String, String> fields) {

    public OverviewTraceEvent {
        formatVersion = 1;
        at = at == null ? Instant.now() : at;
        type = safe(type, 80);
        step = safe(step, 120);
        outcome = safe(outcome, 80);
        LinkedHashMap<String, String> copy = new LinkedHashMap<>();
        if (fields != null) {
            fields.forEach((key, value) -> {
                if (key != null && key.length() <= 80 && value != null) {
                    copy.put(key, value);
                }
            });
        }
        fields = Collections.unmodifiableMap(copy);
    }

    private static String safe(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
