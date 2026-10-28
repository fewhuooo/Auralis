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
public class OverviewJobInvocationJournal {
    private final OverviewJobRepository repository;
    private final AiUsageQueryService usageQuery;
    private final OverviewExecutionJournal executionJournal;

    public OverviewJobInvocationJournal(OverviewJobRepository repository, AiUsageQueryService usageQuery,
                                        OverviewExecutionJournal executionJournal) {
        this.repository = repository;
        this.usageQuery = usageQuery;
        this.executionJournal = executionJournal;
    }

    public AiInvocationBinding binding(OverviewJobRepository.JobLease job,
                                       OverviewGenerationCoordinator.GenerationLease generation,
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
                repository.recordInvocation(job, generation.generationId(), generation.budgetTaskId(), reservationId,
                        purpose, stage, generation.ownerId(), generation.fence());
            }

            @Override
            public void beforeDispatch(java.util.UUID reservationId) {
                repository.beforeDispatch(job, generation.generationId(), generation.budgetTaskId(), reservationId,
                        generation.ownerId(), generation.fence());
            }
        };
    }

    public boolean allSafe(OverviewJobRepository.JobRow job) {
        if (job.generationId() == null || job.budgetTaskId() == null) return true;
        AiOperationKind expected = "SOURCE".equals(job.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        for (OverviewJobRepository.InvocationRow call : repository.invocations(job.userId(), job.id())) {
            java.util.UUID ledgerTaskId = ledgerTaskId(job.userId(), job.scopeType(), job.budgetTaskId());
            if (!job.userId().equals(call.userId()) || !job.generationId().equals(call.generationId())
                    || !ledgerTaskId.equals(call.taskId()) || call.jobFence() == null
                    || call.jobFence() <= 0 || !callSafe(call, expected, job.userId(), ledgerTaskId)) return false;
        }
        return true;
    }

    public boolean allSafe(OverviewGenerationCoordinator.GenerationLease generation) {
        AiOperationKind expected = "SOURCE".equals(generation.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        for (OverviewJobRepository.InvocationRow call : repository.generationInvocations(generation.userId(), generation.generationId())) {
            java.util.UUID ledgerTaskId = ledgerTaskId(generation);
            if (!generation.userId().equals(call.userId()) || !generation.generationId().equals(call.generationId())
                    || !ledgerTaskId.equals(call.taskId()) || call.generationFence() <= 0
                    || call.generationOwner() == null || (call.jobFence() != null && call.jobFence() <= 0)) return false;
            if (!callSafe(call, expected, generation.userId(), ledgerTaskId)
                    && !executionJournal.permitsTerminalUnknownWriterInvocation(generation, call.reservationId())) {
                return false;
            }
        }
        return true;
    }

    private java.util.UUID ledgerTaskId(OverviewGenerationCoordinator.GenerationLease generation) {
        return ledgerTaskId(generation.userId(), generation.scopeType(), generation.budgetTaskId());
    }

    private java.util.UUID ledgerTaskId(java.util.UUID userId, String scopeType, java.util.UUID budgetTaskId) {
        AiFeature feature = "SOURCE".equals(scopeType) ? AiFeature.SOURCE_OVERVIEW : AiFeature.SUBJECT_OVERVIEW;
        return AiTaskContext.overviewLedgerTaskId(userId, feature, budgetTaskId);
    }

    private boolean callSafe(OverviewJobRepository.InvocationRow call, AiOperationKind expected,
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
