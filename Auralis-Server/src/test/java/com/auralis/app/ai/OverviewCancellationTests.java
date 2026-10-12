package com.auralis.app.ai;

import org.junit.jupiter.api.Test;
import com.auralis.app.ai.OverviewGenerationService.SourceGenerationFlight;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;

class OverviewCancellationTests {
    @Test
    void cancellationRunsLiveListenersOnceAndImmediatelyNotifiesLateListeners() {
        OverviewCancellation cancellation = new OverviewCancellation();
        AtomicInteger first = new AtomicInteger();
        AtomicInteger second = new AtomicInteger();
        OverviewCancellation.Registration registration = cancellation.onCancel(first::incrementAndGet);
        registration.close();
        cancellation.onCancel(second::incrementAndGet);

        assertThat(cancellation.cancel(OverviewCancellation.Reason.DEADLINE)).isTrue();
        assertThat(cancellation.cancel(OverviewCancellation.Reason.NO_INTEREST)).isFalse();
        cancellation.onCancel(first::incrementAndGet);

        assertThat(first).hasValue(1);
        assertThat(second).hasValue(1);
        assertThat(cancellation.reason()).isEqualTo(OverviewCancellation.Reason.DEADLINE);
    }

    @Test
    void registrationRacingCancellationAlwaysRunsExactlyOnce() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int iteration = 0; iteration < 2_000; iteration++) {
                OverviewCancellation cancellation = new OverviewCancellation();
                AtomicInteger invocations = new AtomicInteger();
                CountDownLatch start = new CountDownLatch(1);
                var registering = pool.submit(() -> {
                    start.await();
                    cancellation.onCancel(invocations::incrementAndGet);
                    return null;
                });
                var cancelling = pool.submit(() -> {
                    start.await();
                    cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
                    return null;
                });
                start.countDown();
                registering.get(1, TimeUnit.SECONDS);
                cancelling.get(1, TimeUnit.SECONDS);
                assertThat(invocations).hasValue(1);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void lastDetachRacingNewJoinNeverCancelsAnAttachedInterest() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int iteration = 0; iteration < 2_000; iteration++) {
                SourceGenerationFlight flight = new SourceGenerationFlight();
                Runnable first = flight.tryAttachInterest();
                assertThat(first).isNotNull();
                CountDownLatch start = new CountDownLatch(1);
                var detaching = pool.submit(() -> {
                    start.await();
                    first.run();
                    return null;
                });
                var attaching = pool.submit(() -> {
                    start.await();
                    return flight.tryAttachInterest();
                });
                start.countDown();
                detaching.get(1, TimeUnit.SECONDS);
                Runnable second = attaching.get(1, TimeUnit.SECONDS);
                if (second == null) {
                    assertThat(flight.isCancelled()).isTrue();
                } else {
                    assertThat(flight.isCancelled()).isFalse();
                    second.run();
                    assertThat(flight.isCancelled()).isTrue();
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }
}
