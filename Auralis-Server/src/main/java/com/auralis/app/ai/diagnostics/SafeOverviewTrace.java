package com.auralis.app.ai.diagnostics;

import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/** Exception-isolating adapter; disabled calls avoid building event payloads. */
public final class SafeOverviewTrace {
    private final OverviewTrace delegate;
    private SafeOverviewTrace(OverviewTrace delegate) { this.delegate = delegate; }

    public static SafeOverviewTrace disabled() { return new SafeOverviewTrace(null); }
    public static SafeOverviewTrace of(OverviewTrace delegate) { return new SafeOverviewTrace(delegate); }
    public OverviewTraceRun start(UUID owner, UUID request, UUID generation, UUID job) {
        if (delegate == null) return OverviewTraceRun.NOOP;
        try { return delegate.start(owner, request, generation, job); }
        catch (RuntimeException ignored) { return OverviewTraceRun.NOOP; }
    }
    public boolean capturesContent() {
        if (delegate == null) return false;
        try { return delegate.capturesContent(); } catch (RuntimeException ignored) { return false; }
    }
    public void event(OverviewTraceRun run, String type, String step, Integer attempt, String outcome,
                      Map<String, String> metadata, Supplier<Map<String, String>> content) {
        if (run == null || run == OverviewTraceRun.NOOP) return;
        try {
            run.event(type, step, attempt, outcome, metadata,
                    run.capturesContent() && content != null ? content.get() : null);
        } catch (RuntimeException ignored) { }
    }
    public void finish(OverviewTraceRun run, String outcome, String failureCode, Map<String, String> metadata) {
        if (run == null || run == OverviewTraceRun.NOOP) return;
        try { run.finish(outcome, failureCode, metadata); } catch (RuntimeException ignored) { }
    }
}
