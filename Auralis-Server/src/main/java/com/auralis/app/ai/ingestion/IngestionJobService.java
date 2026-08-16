package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.shared.domain.SourceIngestionRequestedEvent;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class IngestionJobService {

    private final IngestionJobRepository jobRepository;

    public IngestionJobService(IngestionJobRepository jobRepository) {
        this.jobRepository = jobRepository;
    }

    @Transactional
    public IngestionJobEntity enqueue(UUID userId, UUID sourceId) {
        return jobRepository.findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(userId, sourceId)
                .filter(IngestionJobEntity::isActive)
                .orElseGet(() -> jobRepository.save(new IngestionJobEntity(
                        UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING)));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSourceIngestionRequested(SourceIngestionRequestedEvent event) {
        enqueue(event.userId(), event.sourceId());
    }
}
