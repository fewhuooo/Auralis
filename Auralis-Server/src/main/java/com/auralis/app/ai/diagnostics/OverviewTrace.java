package com.auralis.app.ai.diagnostics;

import java.util.UUID;

public interface OverviewTrace {
    OverviewTrace NOOP = new OverviewTrace() {
        @Override public OverviewTraceRun start(UUID ownerId, UUID requestId, UUID generationId, UUID jobId) {
            return OverviewTraceRun.NOOP;
        }
        @Override public boolean capturesContent() { return false; }
    };

    OverviewTraceRun start(UUID ownerId, UUID requestId, UUID generationId, UUID jobId);
    boolean capturesContent();

    default void close() { }
}
