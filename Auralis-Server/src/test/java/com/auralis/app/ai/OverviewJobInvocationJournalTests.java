package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationState;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiUsageQueryService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OverviewJobInvocationJournalTests {
    @Test
    void bindsTheExactReservedCallAndFencesDispatchForTheGenerationStage() {
        OverviewJobRepository repository = mock(OverviewJobRepository.class);
        AiUsageQueryService usageQuery = mock(AiUsageQueryService.class);
        OverviewJobInvocationJournal journal = new OverviewJobInvocationJournal(repository, usageQuery,
                mock(OverviewExecutionJournal.class));

        UUID jobId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID workerId = UUID.randomUUID();
        UUID generationId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, taskId);
        UUID generationOwner = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();
        OverviewJobRepository.JobLease job = new OverviewJobRepository.JobLease(jobId, userId, workerId, 7,
                Instant.now().plusSeconds(30), "a".repeat(64), "b".repeat(64), "overview-adaptive-v5-background-jobs");
        OverviewGenerationCoordinator.GenerationLease generation = new OverviewGenerationCoordinator.GenerationLease(
                generationId, userId, "SOURCE", UUID.randomUUID(), UUID.randomUUID(), "a".repeat(64), "b".repeat(64),
                "overview-adaptive-v5-background-jobs", taskId, generationOwner, 11, Instant.now().plusSeconds(30));
        when(usageQuery.invocationStateForOwner(eq(userId), eq(ledgerTaskId), eq(reservationId), anySet()))
                .thenReturn(Optional.of(new AiInvocationState(reservationId, ledgerTaskId, AiOperationKind.SOURCE_OVERVIEW,
                        "RESERVED", false, null, null, 0)));

        var binding = journal.binding(job, generation, "ADAPTIVE_INDEX", "INTERMEDIATE");
        binding.onReserved(reservationId);
        binding.beforeDispatch(reservationId);

        verify(repository).recordInvocation(job, generationId, taskId, reservationId,
                "ADAPTIVE_INDEX", "INTERMEDIATE", generationOwner, 11);
        verify(repository).beforeDispatch(job, generationId, taskId, reservationId, generationOwner, 11);
    }

    @Test
    void refusesAReservationWithTheWrongOperationBeforeWritingItsLineage() {
        OverviewJobRepository repository = mock(OverviewJobRepository.class);
        AiUsageQueryService usageQuery = mock(AiUsageQueryService.class);
        OverviewJobInvocationJournal journal = new OverviewJobInvocationJournal(repository, usageQuery,
                mock(OverviewExecutionJournal.class));
        UUID jobId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID workerId = UUID.randomUUID();
        UUID generationId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, taskId);
        UUID reservationId = UUID.randomUUID();
        OverviewJobRepository.JobLease job = new OverviewJobRepository.JobLease(jobId, userId, workerId, 1,
                Instant.now().plusSeconds(30), "a".repeat(64), "b".repeat(64), "overview-adaptive-v5-background-jobs");
        OverviewGenerationCoordinator.GenerationLease generation = new OverviewGenerationCoordinator.GenerationLease(
                generationId, userId, "SOURCE", UUID.randomUUID(), UUID.randomUUID(), "a".repeat(64), "b".repeat(64),
                "overview-adaptive-v5-background-jobs", taskId, UUID.randomUUID(), 1, Instant.now().plusSeconds(30));
        when(usageQuery.invocationStateForOwner(eq(userId), eq(ledgerTaskId), eq(reservationId), anySet()))
                .thenReturn(Optional.of(new AiInvocationState(reservationId, ledgerTaskId, AiOperationKind.CHAT_TURN,
                        "RESERVED", false, null, null, 0)));

        var binding = journal.binding(job, generation, "ADAPTIVE_INDEX", "INTERMEDIATE");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> binding.onReserved(reservationId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class);
        verify(repository, org.mockito.Mockito.never()).recordInvocation(job, generationId, taskId, reservationId,
                "ADAPTIVE_INDEX", "INTERMEDIATE", generation.ownerId(), generation.fence());
    }
}
