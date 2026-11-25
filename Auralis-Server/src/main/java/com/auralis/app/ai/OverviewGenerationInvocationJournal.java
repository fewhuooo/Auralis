package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationBinding;
import com.auralis.app.ai.usage.AiInvocationState;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.Set;

@Service
public class OverviewGenerationInvocationJournal {
    private final OverviewGenerationInvocationRepository repository;
    private final AiUsageQueryService usageQuery;

    public OverviewGenerationInvocationJournal(OverviewGenerationInvocationRepository repository,
                                               AiUsageQueryService usageQuery) {
        this.repository = repository;
        this.usageQuery = usageQuery;
    }

    public AiInvocationBinding binding(OverviewGenerationCoordinator.GenerationLease generation,
                                      String purpose, String stage) {
        AiOperationKind operationKind = "SOURCE".equals(generation.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        return new AiInvocationBinding() {
            @Override
            public void onReserved(java.util.UUID reservationId) {
                java.util.UUID ledgerTaskId = ledgerTaskId(generation);
                Optional<AiInvocationState> state = usageQuery.invocationStateForOwner(generation.userId(),
                        ledgerTaskId, reservationId, Set.of(operationKind));
                if (state.isEmpty() || state.get().state() == null || !"RESERVED".equals(state.get().state())
                        || state.get().requestDispatched() || !ledgerTaskId.equals(state.get().taskId())
                        || operationKind != state.get().operationKind()) {
                    throw new DomainException("AI_POLICY_CONTRACT_VIOLATION", "Overview invocation could not be bound before dispatch");
                }
                repository.record(generation, reservationId, purpose, stage);
            }

            @Override
            public void beforeDispatch(java.util.UUID reservationId) {
                repository.beforeDispatch(generation, reservationId);
            }
        };
    }

    public boolean allSafe(OverviewGenerationCoordinator.GenerationLease generation) {
        AiOperationKind expected = "SOURCE".equals(generation.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        for (OverviewGenerationInvocationRepository.InvocationRow call
                : repository.findByGeneration(generation.userId(), generation.generationId())) {
            java.util.UUID ledgerTaskId = ledgerTaskId(generation);
            if (!generation.userId().equals(call.userId()) || !generation.generationId().equals(call.generationId())
                    || !ledgerTaskId.equals(call.taskId()) || call.generationFence() <= 0
                    || call.generationOwner() == null) return false;
            if (!callSafe(call, expected, generation.userId(), ledgerTaskId)) {
                return false;
            }
        }
        return true;
    }

    private java.util.UUID ledgerTaskId(OverviewGenerationCoordinator.GenerationLease generation) {
        AiFeature feature = "SOURCE".equals(generation.scopeType()) ? AiFeature.SOURCE_OVERVIEW : AiFeature.SUBJECT_OVERVIEW;
        return AiTaskContext.overviewLedgerTaskId(generation.userId(), feature, generation.budgetTaskId());
    }

    private boolean callSafe(OverviewGenerationInvocationRepository.InvocationRow call, AiOperationKind expected,
                             java.util.UUID userId, java.util.UUID taskId) {
        Optional<AiInvocationState> found = usageQuery.invocationStateForOwner(userId, taskId,
                call.reservationId(), Set.of(expected));
        if (found.isEmpty()) return false;
        AiInvocationState state = found.get();
        if (!call.reservationId().equals(state.reservationId()) || !taskId.equals(state.taskId())
                || expected != state.operationKind()) return false;
        return switch (state.state()) {
            case "COMPLETED" -> true;
            case "FAILED" -> !state.requestDispatched()
                    || state.actualInputTokens() != null && state.actualOutputTokens() != null;
            case "RESERVED", "RELEASED", "EXPIRED" -> !state.requestDispatched();
            default -> false;
        };
    }
}
