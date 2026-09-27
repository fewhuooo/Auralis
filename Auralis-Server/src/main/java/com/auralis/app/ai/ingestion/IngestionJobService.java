package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.source.IngestionJobReference;
import com.auralis.app.source.ParsedDocumentIngestionPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;

@Service
public class IngestionJobService implements ParsedDocumentIngestionPort {

    private static final List<IngestionJobStatus> ACTIVE_STATUSES =
            List.of(IngestionJobStatus.PENDING, IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING);

    private final IngestionJobRepository jobRepository;

    public IngestionJobService(IngestionJobRepository jobRepository) {
        this.jobRepository = jobRepository;
    }

    @Transactional
    public IngestionJobEntity enqueue(UUID userId, UUID sourceId, UUID ingestionRevision) {
        if (ingestionRevision == null) {
            throw new IllegalArgumentException("Ingestion revision is required");
        }
        Optional<IngestionJobEntity> existing = jobRepository
                .findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                        userId, sourceId, ingestionRevision, ACTIVE_STATUSES);
        if (existing.isPresent()) {
            return existing.get();
        }
        return jobRepository.save(new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), ingestionRevision));
    }

    @Transactional
    @Override
    public IngestionJobReference enqueueServerOwnedSource(
            UUID userId, UUID sourceId, UUID ingestionRevision) {
        return reference(enqueue(userId, sourceId, ingestionRevision));
    }

    @Transactional
    @Override
    public IngestionJobReference enqueueParsedDocument(
            UUID userId, UUID sourceId, UUID parsedDocumentId, UUID ingestionRevision, UUID generation) {
        Optional<IngestionJobEntity> existing = jobRepository
                .findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                        userId, sourceId, ingestionRevision, ACTIVE_STATUSES);
        if (existing.isPresent()) {
            IngestionJobEntity job = existing.get();
            return reference(job);
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
            return Optional.of(job);
        }
        job.claim(now, leaseUntil);
        return Optional.of(jobRepository.saveAndFlush(job));
    }

    @Transactional
    public Optional<IngestionJobEntity> claimById(
            UUID userId, UUID jobId, Instant now, Instant leaseUntil, int maxAttempts) {
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("maxAttempts must be positive");
        }
        Optional<IngestionJobEntity> found = jobRepository.findForUpdateByIdAndUserId(jobId, userId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        IngestionJobEntity job = found.get();
        boolean expiredLease = (job.getStatus() == IngestionJobStatus.PARSING
                || job.getStatus() == IngestionJobStatus.INDEXING)
                && job.getLeaseUntil() != null && !job.getLeaseUntil().isAfter(now);
        if (job.getStatus() != IngestionJobStatus.PENDING && !expiredLease) {
            return Optional.empty();
        }
        if (job.getAttemptCount() >= maxAttempts) {
            return Optional.of(job);
        }
        job.claim(now, leaseUntil);
        return Optional.of(jobRepository.saveAndFlush(job));
    }

    private IngestionJobReference reference(IngestionJobEntity job) {
        return new IngestionJobReference(job.getId());
    }
}
