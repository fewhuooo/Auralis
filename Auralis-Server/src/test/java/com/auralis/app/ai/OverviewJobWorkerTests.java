package com.auralis.app.ai;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;

import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.ScheduledExecutorService;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OverviewJobWorkerTests {
    @Test
    void zeroDirectTaskTimeoutDisablesDurableJobDeadline() {
        OverviewJobService service = mock(OverviewJobService.class);
        OverviewJobRepository repository = mock(OverviewJobRepository.class);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        AuralisProperties.Limits limits = mock(AuralisProperties.Limits.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.overviewTaskTimeoutMillis()).thenReturn(0L);
        when(ai.limits()).thenReturn(limits);
        when(limits.reservationLeaseMillis()).thenReturn(300_000L);
        when(service.claim(any(UUID.class), eq(300_000L), eq(0L))).thenReturn(null);
        Executor executor = Runnable::run;
        OverviewJobWorker worker = new OverviewJobWorker(service, repository, properties,
                executor, mock(ScheduledExecutorService.class));
        worker.poll();

        verify(service).claim(any(UUID.class), eq(300_000L), eq(0L));
    }

    @Test
    void positiveConfiguredTaskTimeoutRemainsDurableJobDeadline() {
        OverviewJobService service = mock(OverviewJobService.class);
        OverviewJobRepository repository = mock(OverviewJobRepository.class);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        AuralisProperties.Limits limits = mock(AuralisProperties.Limits.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.overviewTaskTimeoutMillis()).thenReturn(180_000L);
        when(ai.limits()).thenReturn(limits);
        when(limits.reservationLeaseMillis()).thenReturn(300_000L);
        when(service.claim(any(UUID.class), eq(300_000L), eq(180_000L))).thenReturn(null);
        OverviewJobWorker worker = new OverviewJobWorker(service, repository, properties,
                Runnable::run, mock(ScheduledExecutorService.class));
        worker.poll();

        verify(service).claim(any(UUID.class), eq(300_000L), eq(180_000L));
    }
}
