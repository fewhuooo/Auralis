package com.auralis.app.ai;

import com.auralis.app.shared.config.AuralisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class OverviewJobWorker {
    private static final Logger LOGGER = LoggerFactory.getLogger(OverviewJobWorker.class);
    private final OverviewJobService service;
    private final OverviewJobRepository repository;
    private final AuralisProperties properties;
    private final Executor executor;
    private final ScheduledExecutorService heartbeatScheduler;
    private final UUID workerId = UUID.randomUUID();
    private final AtomicBoolean dispatching = new AtomicBoolean();

    public OverviewJobWorker(OverviewJobService service, OverviewJobRepository repository,
                             AuralisProperties properties,
                             @Qualifier("overviewGenerationExecutor") Executor executor,
                             @Qualifier("overviewHeartbeatScheduler") ScheduledExecutorService heartbeatScheduler) {
        this.service = service;
        this.repository = repository;
        this.properties = properties;
        this.executor = executor;
        this.heartbeatScheduler = heartbeatScheduler;
    }

    @Scheduled(fixedDelayString = "${auralis.ai.overview-jobs-poll-ms:1000}")
    public void poll() {
        try {
            repository.expireOneOverdue();
        } catch (RuntimeException failure) {
            LOGGER.warn("Overview job expiry scan failed safely: {}", failure.getClass().getSimpleName());
        }
        if (!dispatching.compareAndSet(false, true)) return;
        long leaseMillis = properties.ai().limits().reservationLeaseMillis();
        OverviewJobRepository.JobRow job;
        try {
            job = service.claim(workerId, leaseMillis, properties.ai().overviewTaskTimeoutMillis());
        } catch (RuntimeException failure) {
            dispatching.set(false);
            LOGGER.warn("Overview job claim failed safely: {}", failure.getClass().getSimpleName());
            return;
        }
        if (job == null) {
            dispatching.set(false);
            return;
        }
        OverviewCancellation cancellation = new OverviewCancellation();
        long heartbeatMillis = Math.max(100, leaseMillis / 3);
        var heartbeat = heartbeatScheduler.scheduleWithFixedDelay(() -> {
            try {
                if (!repository.heartbeat(job.lease(), leaseMillis)) {
                    cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
                }
            } catch (RuntimeException failure) {
                cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            }
        }, heartbeatMillis, heartbeatMillis, TimeUnit.MILLISECONDS);
        try {
            executor.execute(() -> {
                try {
                    service.executeClaimed(job, cancellation);
                } finally {
                    heartbeat.cancel(false);
                    dispatching.set(false);
                }
            });
        } catch (RejectedExecutionException rejected) {
            heartbeat.cancel(false);
            dispatching.set(false);
            LOGGER.warn("Overview job executor is full; job lease will expire for safe re-claim");
        }
    }
}
