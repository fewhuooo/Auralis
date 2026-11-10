package com.auralis.app.ai.usage;

import java.util.UUID;

@FunctionalInterface
public interface AiInvocationBinding {
    void onReserved(UUID reservationId);

    /** Revalidate the generation before each attempt to acquire capacity. */
    default void beforeReservation() {
    }

    /** Recompute the remaining task deadline after admission has waited. */
    default long responseTimeoutMillis(long requestedMillis) {
        return requestedMillis;
    }

    default void beforeDispatch(UUID reservationId) {
    }
}
