package com.auralis.app.ai.usage;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Safe, exact-call ledger state used by bounded internal recovery decisions. */
public record AiInvocationState(UUID reservationId, UUID taskId, AiOperationKind operationKind, String state,
                                boolean requestDispatched, Long actualInputTokens, Long actualOutputTokens,
                                long chargedTokens) {
    private static final Set<String> STATES = Set.of("RESERVED", "RELEASED", "EXPIRED", "COMPLETED", "FAILED");

    public AiInvocationState {
        Objects.requireNonNull(reservationId);
        Objects.requireNonNull(taskId);
        Objects.requireNonNull(operationKind);
        if (state == null || !STATES.contains(state)) throw new IllegalArgumentException("Invalid invocation state");
        if (actualInputTokens != null && actualInputTokens < 0) throw new IllegalArgumentException("Invalid input usage");
        if (actualOutputTokens != null && actualOutputTokens < 0) throw new IllegalArgumentException("Invalid output usage");
        if (chargedTokens < 0) throw new IllegalArgumentException("Invalid charged usage");
    }
}
