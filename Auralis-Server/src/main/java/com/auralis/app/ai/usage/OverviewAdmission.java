package com.auralis.app.ai.usage;

import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.shared.error.DomainException;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/** Bounded waiting for capacity only; never retries a dispatched Provider call. */
final class OverviewAdmission {
    private final long maxWaitMillis;
    private final Semaphore waiters;

    OverviewAdmission(long maxWaitMillis, int maxWaiters) {
        if (maxWaitMillis <= 0 || maxWaiters <= 0) throw new IllegalArgumentException();
        this.maxWaitMillis = maxWaitMillis;
        this.waiters = new Semaphore(maxWaiters);
    }

    <T> T reserve(Supplier<T> reservation, Runnable revalidate, OverviewCancellation cancellation) {
        long started = System.nanoTime();
        boolean waiting = false;
        AiUsageLimitException lastUnavailable = null;
        try {
            while (true) {
                checkCancelled(cancellation);
                if (waiting && System.nanoTime() - started >= TimeUnit.MILLISECONDS.toNanos(maxWaitMillis)) {
                    throw lastUnavailable;
                }
                revalidate.run();
                checkCancelled(cancellation);
                try {
                    return reservation.get();
                } catch (AiUsageLimitException unavailable) {
                    if (!unavailable.capacityUnavailable()) throw unavailable;
                    lastUnavailable = unavailable;
                    checkCancelled(cancellation);
                    long remaining = TimeUnit.MILLISECONDS.toNanos(maxWaitMillis) - (System.nanoTime() - started);
                    if (remaining <= 0) throw unavailable;
                    if (!waiting) {
                        if (!waiters.tryAcquire()) throw unavailable;
                        waiting = true;
                    }
                    // reserve() has returned and its short database transaction
                    // has ended. No ledger reservation exists for this waiter.
                    try {
                        TimeUnit.NANOSECONDS.sleep(Math.min(remaining, TimeUnit.MILLISECONDS.toNanos(100)));
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw new DomainException("MODEL_TIMEOUT", "Overview admission was interrupted");
                    }
                }
            }
        } finally {
            if (waiting) waiters.release();
        }
    }

    static void checkCancelled(OverviewCancellation cancellation) {
        if (Thread.currentThread().isInterrupted() || cancellation != null && cancellation.isCancelled()) {
            throw new DomainException("MODEL_TIMEOUT", "Overview generation was cancelled before dispatch");
        }
    }
}
