package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;

import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

/** Monotonic, cooperative deadline shared by every Provider stage in one Overview request. */
public final class OverviewTaskDeadline {

    private final LongSupplier nanoTime;
    private final long startedAtNanos;
    private final long budgetNanos;
    private final boolean unbounded;
    private final OverviewCancellation cancellation = new OverviewCancellation();
    private final AtomicInteger references = new AtomicInteger(1);
    private volatile ScheduledFuture<?> watchdog;
    private boolean watchdogStarted;

    public OverviewTaskDeadline(long timeoutMillis, LongSupplier nanoTime) {
        if (timeoutMillis < 0) {
            throw new IllegalArgumentException("Overview task timeout must not be negative");
        }
        this.nanoTime = Objects.requireNonNull(nanoTime);
        this.startedAtNanos = nanoTime.getAsLong();
        this.unbounded = timeoutMillis == 0;
        this.budgetNanos = unbounded ? 0 : TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
    }

    public long remainingMillis() {
        if (cancellation.isCancelled()) throw expired();
        if (unbounded) return Long.MAX_VALUE;
        long remainingNanos = budgetNanos - (nanoTime.getAsLong() - startedAtNanos);
        if (remainingNanos <= 0) {
            cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            throw expired();
        }
        if (cancellation.isCancelled()) throw expired();
        return Math.max(1, TimeUnit.NANOSECONDS.toMillis(remainingNanos - 1) + 1);
    }

    public OverviewCancellation cancellation() { return cancellation; }

    /** Keeps the absolute watchdog alive while a shared source generation outlives its owner request. */
    public OverviewTaskDeadline retain() {
        while (true) {
            int current = references.get();
            if (current <= 0) throw new IllegalStateException("Overview deadline is already finished");
            if (references.compareAndSet(current, current + 1)) return this;
        }
    }

    public synchronized void startWatchdog(ScheduledExecutorService scheduler) {
        if (watchdogStarted) throw new IllegalStateException("Overview deadline watchdog already started");
        watchdogStarted = true;
        if (unbounded) return;
        long remaining = budgetNanos - (nanoTime.getAsLong() - startedAtNanos);
        if (remaining <= 0) {
            cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            return;
        }
        watchdog = scheduler.schedule(() -> cancellation.cancel(OverviewCancellation.Reason.DEADLINE),
                remaining, TimeUnit.NANOSECONDS);
    }

    public void finish() {
        int remaining = references.decrementAndGet();
        if (remaining < 0) throw new IllegalStateException("Overview deadline finished too many times");
        if (remaining == 0) {
            ScheduledFuture<?> current = watchdog;
            if (current != null) current.cancel(false);
        }
    }

    public long responseTimeoutMillis(long configuredTimeoutMillis) {
        if (configuredTimeoutMillis <= 0) {
            throw new IllegalArgumentException("Provider response timeout must be positive");
        }
        return Math.min(configuredTimeoutMillis, remainingMillis());
    }

    private DomainException expired() {
        return new DomainException("MODEL_TIMEOUT", "Overview generation exceeded its task deadline");
    }
}
