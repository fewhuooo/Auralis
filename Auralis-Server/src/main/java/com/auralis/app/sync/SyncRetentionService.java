package com.auralis.app.sync;

import com.auralis.app.sync.internal.persistence.ChangeLogRepository;
import com.auralis.app.sync.internal.persistence.InboundMutationRepository;
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

    public SyncRetentionService(
            ChangeLogRepository changeLogRepository,
            InboundMutationRepository inboundMutationRepository,
            Clock clock) {
        this.changeLogRepository = changeLogRepository;
        this.inboundMutationRepository = inboundMutationRepository;
        this.clock = clock;
    }

    @Transactional
    public long purgeExpired() {
        var cutoff = clock.instant().minus(RETENTION);
        return changeLogRepository.deleteByCreatedAtBefore(cutoff)
                + inboundMutationRepository.deleteByCreatedAtBefore(cutoff);
    }
}
