package com.auralis.app.ai;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/** One-shot cancellation signal with race-safe listener registration. */
public final class OverviewCancellation {

    public enum Reason { DEADLINE, REQUEST_DISCONNECTED, NO_INTEREST }

    private final AtomicReference<Reason> reason = new AtomicReference<>();
    private final AtomicLong listenerIds = new AtomicLong();
    private final Map<Long, Runnable> listeners = new ConcurrentHashMap<>();

    public boolean cancel(Reason cancellationReason) {
        if (cancellationReason == null) throw new NullPointerException("cancellationReason");
        if (!reason.compareAndSet(null, cancellationReason)) return false;
        listeners.forEach((id, listener) -> runListener(id, listener));
        // Do not clear here: a concurrent onCancel may have published after forEach began.
        // That registration observes the cancellation and removes/runs itself exactly once.
        return true;
    }

    public boolean isCancelled() { return reason.get() != null; }
    public Reason reason() { return reason.get(); }
    public Registration onCancel(Runnable listener) {
        long id = listenerIds.incrementAndGet();
        if (isCancelled()) {
            listener.run();
            return () -> { };
        }
        listeners.put(id, listener);
        if (isCancelled()) runListener(id, listener);
        return () -> listeners.remove(id);
    }

    private void runListener(long id, Runnable listener) {
        if (listeners.remove(id, listener)) {
            try {
                listener.run();
            } catch (RuntimeException ignored) {
                // Cancellation must continue to every registered transport/resource.
            }
        }
    }

    @FunctionalInterface
    public interface Registration extends AutoCloseable {
        @Override void close();
    }
}
