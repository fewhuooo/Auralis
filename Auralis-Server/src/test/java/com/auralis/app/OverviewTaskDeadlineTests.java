package com.auralis.app;

import com.auralis.app.ai.OverviewTaskDeadline;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;

import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class OverviewTaskDeadlineTests {
    @Test
    void zeroTimeoutStaysUnboundedWithoutSchedulingAndStillHonorsCancellation() {
        ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
        AtomicLong monotonicNanos = new AtomicLong();
        OverviewTaskDeadline deadline = new OverviewTaskDeadline(0, monotonicNanos::get);

        deadline.startWatchdog(scheduler);
        monotonicNanos.set(Long.MAX_VALUE);

        assertThat(deadline.remainingMillis()).isEqualTo(Long.MAX_VALUE);
        assertThat(deadline.responseTimeoutMillis(120_000)).isEqualTo(120_000);
        verifyNoInteractions(scheduler);
        assertThatThrownBy(() -> deadline.startWatchdog(scheduler))
                .isInstanceOf(IllegalStateException.class);
        deadline.cancellation().cancel(com.auralis.app.ai.OverviewCancellation.Reason.REQUEST_DISCONNECTED);
        assertThatThrownBy(deadline::remainingMillis).isInstanceOf(DomainException.class)
                .hasMessageContaining("deadline");
        deadline.finish();
    }

    @Test
    void rejectsNegativeTimeout() {
        assertThatThrownBy(() -> new OverviewTaskDeadline(-1, System::nanoTime))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
