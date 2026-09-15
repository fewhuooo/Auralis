package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.shared.domain.SourceIngestionRequestedEvent;
import com.auralis.app.source.IngestionJobReference;
import com.auralis.app.source.ParsedDocumentIngestionPort;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;

@Service
public class IngestionJobService implements ParsedDocumentIngestionPort {

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

    @Transactional
    @Override
    public IngestionJobReference enqueueParsedDocument(
            UUID userId, UUID sourceId, UUID parsedDocumentId, UUID ingestionRevision, UUID generation) {
        Optional<IngestionJobEntity> existing = jobRepository
                .findFirstByUserIdAndSourceIdAndIngestionRevisionOrderByCreatedAtDesc(
                        userId, sourceId, ingestionRevision);
        if (existing.isPresent()) {
            IngestionJobEntity job = existing.get();
            if (job.isActive()) {
                return reference(job);
            }
            job.requeueParsedDocument(parsedDocumentId, ingestionRevision, generation);
            return reference(jobRepository.save(job));
        }
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation);
        job.attachParsedDocument(parsedDocumentId, ingestionRevision);
        return reference(jobRepository.save(job));
    }

    @Transactional(readOnly = true)
    @Override
    public Optional<IngestionJobReference> findParsedDocumentJob(
            UUID userId, UUID sourceId, UUID ingestionRevision) {
        return jobRepository.findFirstByUserIdAndSourceIdAndIngestionRevisionOrderByCreatedAtDesc(
                userId, sourceId, ingestionRevision).map(this::reference);
    }

    @Transactional
    public Optional<IngestionJobEntity> claimNext(Instant now, Instant leaseUntil, int maxAttempts) {
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("maxAttempts must be positive");
        }
        List<IngestionJobEntity> jobs = jobRepository.findNextClaimable(
                now,
                IngestionJobStatus.PENDING,
                List.of(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING),
                PageRequest.of(0, 1));
        if (jobs.isEmpty()) {
            return Optional.empty();
        }
        IngestionJobEntity job = jobs.get(0);
        if (job.getAttemptCount() >= maxAttempts) {
            job.markFailed(now, "INGESTION_RETRY_EXHAUSTED", "Ingestion retries exhausted");
        } else {
            job.claim(now, leaseUntil);
        }
        return Optional.of(jobRepository.saveAndFlush(job));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onSourceIngestionRequested(SourceIngestionRequestedEvent event) {
        enqueue(event.userId(), event.sourceId());
    }

    private IngestionJobReference reference(IngestionJobEntity job) {
        return new IngestionJobReference(job.getId());
    }
}
