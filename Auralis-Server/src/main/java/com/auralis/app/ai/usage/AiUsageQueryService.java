package com.auralis.app.ai.usage;

import java.util.UUID;
import java.util.Set;
import java.util.Optional;

public interface AiUsageQueryService {

    AiUsageSnapshot snapshotForUser(UUID userId);

    default AiTaskUsageSnapshot taskUsageForOwner(UUID userId, UUID taskId, Set<AiOperationKind> allowedKinds) {
        throw new UnsupportedOperationException("Task usage lookup is unavailable");
    }

    default Optional<AiInvocationState> invocationStateForOwner(UUID userId, UUID taskId, UUID reservationId,
                                                                 Set<AiOperationKind> allowedKinds) {
        throw new AiPolicyContractException();
    }

    /** True only when a terminal dispatched failure retained at least its complete conservative reserve. */
    default boolean isConservativelyChargedTerminalFailure(UUID userId, UUID taskId, UUID reservationId,
                                                           AiOperationKind operationKind) {
        return false;
    }
}
