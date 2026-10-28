package com.auralis.app.ai.diagnostics;

import java.util.Map;
import java.util.UUID;

/** Safe boundary used by business code; implementations must never affect generation outcomes. */
public interface OverviewTraceRun {
    OverviewTraceRun NOOP = new OverviewTraceRun() {
        @Override public UUID runId() { return null; }
        @Override public boolean capturesContent() { return false; }
        @Override public void event(String type, String step, Integer attempt, String outcome,
                                    Map<String, String> metadata, Map<String, String> content) { }
        @Override public void finish(String outcome, String failureCode, Map<String, String> metadata) { }
    };

    UUID runId();
    boolean capturesContent();
    void event(String type, String step, Integer attempt, String outcome,
               Map<String, String> metadata, Map<String, String> content);
    void finish(String outcome, String failureCode, Map<String, String> metadata);
}
