package com.auralis.app.ai.usage;

import java.util.UUID;

@FunctionalInterface
public interface AiInvocationBinding {
    void onReserved(UUID reservationId);

    default void beforeDispatch(UUID reservationId) {
    }
}
