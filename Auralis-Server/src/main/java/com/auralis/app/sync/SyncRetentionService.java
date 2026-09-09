package com.auralis.app.sync;

import com.auralis.app.sync.internal.persistence.ChangeLogRepository;
import com.auralis.app.sync.internal.persistence.InboundMutationRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;

@Service
public class SyncRetentionService {

    private static final Duration RETENTION = Duration.ofDays(30);

    private final ChangeLogRepository changeLogRepository;
    private final InboundMutationRepository inboundMutationRepository;
    private final Clock clock;
    private final Counter purgedRows;
    private final Counter cleanupFailures;

    public SyncRetentionService(
            ChangeLogRepository changeLogRepository,
            InboundMutationRepository inboundMutationRepository,
            Clock clock,
            MeterRegistry meterRegistry) {
        this.changeLogRepository = changeLogRepository;
        this.inboundMutationRepository = inboundMutationRepository;
        this.clock = clock;
        this.purgedRows = Counter.builder("auralis.sync.retention.purged")
                .description("Rows removed by Sync retention cleanup")
                .register(meterRegistry);
        this.cleanupFailures = Counter.builder("auralis.sync.retention.cleanup_failures")
                .description("Sync retention cleanup failures")
                .register(meterRegistry);
    }

    @Transactional
    public long purgeExpired() {
        var cutoff = clock.instant().minus(RETENTION);
        long changeLogs = changeLogRepository.deleteByCreatedAtBefore(cutoff);
        long inboundMutations = inboundMutationRepository.deleteByCreatedAtBefore(cutoff);
        purgedRows.increment(changeLogs + inboundMutations);
        return changeLogs + inboundMutations;
    }

    @Scheduled(
            fixedDelayString = "${auralis.sync.retention-cleanup-delay-millis:3600000}",
            initialDelayString = "${auralis.sync.retention-cleanup-initial-delay-millis:60000}")
    @Transactional
    public void scheduledPurgeExpired() {
        try {
            purgeExpired();
        } catch (RuntimeException exception) {
            cleanupFailures.increment();
            throw exception;
        }
    }
}
