package com.auralis.app;

import com.auralis.app.shared.config.WebConfiguration;
import org.junit.jupiter.api.Test;

import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class OverviewSchedulerCancellationTests {

    @Test
    void cancelledDeadlineAndHeartbeatTasksAreRemovedFromTimerQueues() {
        assertQueueRetiresCancelledTask(WebConfiguration.overviewDeadlineScheduler(), "overview-deadline-watchdog");
        assertQueueRetiresCancelledTask(WebConfiguration.overviewHeartbeatScheduler(), "overview-heartbeat-timer");
    }

    @Test
    void terminalWriterQueueIsBoundedToTheSseAdmissionLimit() {
        ThreadPoolExecutor writer = WebConfiguration.overviewSseWriterExecutor();
        try {
            assertThat(writer.getCorePoolSize()).isEqualTo(8);
            assertThat(writer.getMaximumPoolSize()).isEqualTo(8);
            assertThat(writer.getQueue()).hasSize(0);
            assertThat(writer.getQueue().remainingCapacity()).isEqualTo(8);
        } finally {
            writer.shutdownNow();
        }
    }

    private void assertQueueRetiresCancelledTask(java.util.concurrent.ScheduledExecutorService service,
                                                   String expectedThreadName) {
        ScheduledThreadPoolExecutor executor = (ScheduledThreadPoolExecutor) service;
        try {
            ScheduledFuture<?> scheduled = executor.schedule(() -> { }, 1, TimeUnit.HOURS);
            assertThat(executor.getQueue()).hasSize(1);
            assertThat(scheduled.cancel(false)).isTrue();
            assertThat(executor.getQueue()).isEmpty();

            String actualThreadName = executor.submit(() -> Thread.currentThread().getName())
                    .get(2, TimeUnit.SECONDS);
            // The submitted task runs on the executor; the expected name is also part of the resource contract.
            assertThat(actualThreadName).isEqualTo(expectedThreadName);
            assertThat(executor.getThreadFactory().newThread(() -> { }).isDaemon()).isTrue();
        } catch (Exception failure) {
            throw new AssertionError(failure);
        } finally {
            executor.shutdownNow();
        }
    }
}
