package com.auralis.app.ai.usage;

import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewAdmissionTests {
    private static AiUsageLimitException busy() {
        return AiUsageLimitException.capacityUnavailable("AI_CONCURRENCY_LIMIT", 429, 1, null);
    }

    @Test
    void retriesOnlyReservationAndRevalidatesBeforeEveryAttempt() {
        AtomicInteger attempts = new AtomicInteger();
        AtomicInteger validations = new AtomicInteger();
        String reserved = new OverviewAdmission(2_000, 1).reserve(() -> {
            if (attempts.incrementAndGet() == 1) throw busy();
            return "reserved-once";
        }, validations::incrementAndGet, null);
        assertThat(reserved).isEqualTo("reserved-once");
        assertThat(attempts.get()).isEqualTo(2);
        assertThat(validations.get()).isEqualTo(2);
    }

    @Test
    void doesNotRetryQuotaFailures() {
        AtomicInteger attempts = new AtomicInteger();
        assertThatThrownBy(() -> new OverviewAdmission(1_000, 1).reserve(() -> {
            attempts.incrementAndGet();
            throw new AiUsageLimitException("AI_TASK_BUDGET_EXCEEDED", 422, 0, null);
        }, () -> { }, null)).isInstanceOf(AiUsageLimitException.class)
                .hasMessage("AI_TASK_BUDGET_EXCEEDED");
        assertThat(attempts.get()).isEqualTo(1);
    }

    @Test
    void doesNotRetryNonCapacityConcurrencyFailures() {
        AtomicInteger attempts = new AtomicInteger();
        assertThatThrownBy(() -> new OverviewAdmission(1_000, 1).reserve(() -> {
            attempts.incrementAndGet();
            throw new AiUsageLimitException("AI_CONCURRENCY_LIMIT", 429, 1, null);
        }, () -> { }, null)).isInstanceOf(AiUsageLimitException.class)
                .hasMessage("AI_CONCURRENCY_LIMIT");
        assertThat(attempts.get()).isEqualTo(1);
    }

    @Test
    void capacityWaitIsBoundedAndReleasesItsPermit() {
        OverviewAdmission admission = new OverviewAdmission(20, 1);
        assertThatThrownBy(() -> admission.reserve(() -> { throw busy(); }, () -> { }, null))
                .isInstanceOf(AiUsageLimitException.class);
        assertThat(admission.reserve(() -> "next", () -> { }, null)).isEqualTo("next");
    }

    @Test
    void cancellationWhileWaitingPreventsAnotherReservationAttempt() {
        OverviewCancellation cancellation = new OverviewCancellation();
        AtomicInteger attempts = new AtomicInteger();
        assertThatThrownBy(() -> new OverviewAdmission(1_000, 1).reserve(() -> {
            attempts.incrementAndGet();
            cancellation.cancel(OverviewCancellation.Reason.NO_INTEREST);
            throw busy();
        }, () -> { }, cancellation)).isInstanceOf(DomainException.class);
        assertThat(attempts.get()).isEqualTo(1);
    }

    @Test
    void changedSourceOrOwnerStopsWaitingBeforeReservation() {
        AtomicInteger validations = new AtomicInteger();
        AtomicInteger attempts = new AtomicInteger();
        assertThatThrownBy(() -> new OverviewAdmission(1_000, 1).reserve(() -> {
            attempts.incrementAndGet();
            throw busy();
        }, () -> {
            if (validations.incrementAndGet() > 1) throw new DomainException("MODEL_TIMEOUT", "stale owner");
        }, null)).isInstanceOf(DomainException.class).hasMessage("stale owner");
        assertThat(attempts.get()).isEqualTo(1);
    }

    @Test
    void waitingThreadCountIsBounded() throws Exception {
        OverviewAdmission admission = new OverviewAdmission(2_000, 1);
        AtomicInteger validations = new AtomicInteger();
        CountDownLatch waiting = new CountDownLatch(1);
        OverviewCancellation cancellation = new OverviewCancellation();
        try (var executor = Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> admission.reserve(() -> { throw busy(); }, () -> {
                if (validations.incrementAndGet() == 2) waiting.countDown();
            }, cancellation));
            try {
                assertThat(waiting.await(1, TimeUnit.SECONDS)).isTrue();
                AtomicInteger secondAttempts = new AtomicInteger();
                assertThatThrownBy(() -> admission.reserve(() -> {
                    secondAttempts.incrementAndGet();
                    throw busy();
                }, () -> { }, null)).isInstanceOf(AiUsageLimitException.class);
                assertThat(secondAttempts.get()).isEqualTo(1);
            } finally {
                cancellation.cancel(OverviewCancellation.Reason.NO_INTEREST);
            }
            assertThatThrownBy(() -> first.get(1, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DomainException.class);
        }
    }
}
