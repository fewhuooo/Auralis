package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationState;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiUsageQueryService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverviewGenerationInvocationJournalTests {
    @Test
    void dispatchedFailureRequiresKnownActualUsageEvenWhenItsReserveWasCharged() {
        var fixture = fixture();
        fixture.state("FAILED", true, null, null, 10_000);
        assertThat(fixture.journal().allSafe(fixture.lease())).isFalse();

        fixture.state("FAILED", true, 10L, 20L, 30);
        assertThat(fixture.journal().allSafe(fixture.lease())).isTrue();
    }

    @Test
    void undispatchedTerminalCallsAndCompletedCallsAreSafeButActiveDispatchIsNot() {
        var fixture = fixture();
        fixture.state("RELEASED", false, null, null, 0);
        assertThat(fixture.journal().allSafe(fixture.lease())).isTrue();

        fixture.state("RESERVED", true, null, null, 0);
        assertThat(fixture.journal().allSafe(fixture.lease())).isFalse();

        fixture.state("COMPLETED", true, 10L, 20L, 30);
        assertThat(fixture.journal().allSafe(fixture.lease())).isTrue();
    }

    @Test
    void missingUsageReceiptCannotAuthorizeASafeResult() {
        var fixture = fixture();
        when(fixture.usage().invocationStateForOwner(fixture.lease().userId(), fixture.taskId(),
                fixture.reservationId(), Set.of(AiOperationKind.SOURCE_OVERVIEW))).thenReturn(Optional.empty());
        assertThat(fixture.journal().allSafe(fixture.lease())).isFalse();
    }

    private Fixture fixture() {
        var repository = mock(OverviewGenerationInvocationRepository.class);
        var usage = mock(AiUsageQueryService.class);
        var lease = new OverviewGenerationCoordinator.GenerationLease(UUID.randomUUID(), UUID.randomUUID(),
                "SOURCE", UUID.randomUUID(), UUID.randomUUID(), "input", "profile", "overview-markdown-v2",
                UUID.randomUUID(), UUID.randomUUID(), 1, Instant.now().plusSeconds(60));
        UUID taskId = AiTaskContext.overviewLedgerTaskId(lease.userId(), AiFeature.SOURCE_OVERVIEW, lease.budgetTaskId());
        UUID reservationId = UUID.randomUUID();
        when(repository.findByGeneration(lease.userId(), lease.generationId())).thenReturn(List.of(
                new OverviewGenerationInvocationRepository.InvocationRow(reservationId, taskId, lease.generationId(),
                        lease.userId(), "SOURCE", "CLEAN", lease.ownerId(), lease.fence())));
        return new Fixture(new OverviewGenerationInvocationJournal(repository, usage), usage, lease, taskId, reservationId);
    }

    private record Fixture(OverviewGenerationInvocationJournal journal, AiUsageQueryService usage,
                           OverviewGenerationCoordinator.GenerationLease lease, UUID taskId, UUID reservationId) {
        void state(String status, boolean dispatched, Long input, Long output, long charged) {
            when(usage.invocationStateForOwner(lease.userId(), taskId, reservationId,
                    Set.of(AiOperationKind.SOURCE_OVERVIEW))).thenReturn(Optional.of(new AiInvocationState(
                    reservationId, taskId, AiOperationKind.SOURCE_OVERVIEW, status, dispatched, input, output, charged)));
        }
    }
}
