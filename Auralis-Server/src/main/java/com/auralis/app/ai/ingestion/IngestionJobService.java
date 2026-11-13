package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.source.IngestionJobReference;
import com.auralis.app.source.ParsedDocumentIngestionPort;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
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
    private final Clock clock;

    @Autowired
    public IngestionJobService(IngestionJobRepository jobRepository, Clock clock) {
        this.jobRepository = jobRepository;
        this.clock = clock;
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
            return reference(existing.get());
        }
        return reference(createParsedDocumentJob(userId, sourceId, parsedDocumentId, ingestionRevision, generation));
    }

    @Transactional
    @Override
    public void resumeParsedDocument(
            UUID userId, UUID sourceId, UUID parsedDocumentId, UUID ingestionRevision, UUID generation) {
        var existing = jobRepository
                .findFirstForUpdateByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                        userId, sourceId, ingestionRevision, ACTIVE_STATUSES);
        if (existing.isPresent()) {
            // A worker holding this claim may have observed the source while it was deleted.
            existing.get().releaseClaim();
            return;
        }
        createParsedDocumentJob(userId, sourceId, parsedDocumentId, ingestionRevision, generation);
    }

    private IngestionJobEntity createParsedDocumentJob(
            UUID userId, UUID sourceId, UUID parsedDocumentId, UUID ingestionRevision, UUID generation) {
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation);
        job.attachParsedDocument(parsedDocumentId, ingestionRevision);
        return jobRepository.save(job);
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
        boolean expiredLease = isExpiredLease(job, now);
        if (expiredLease) {
            job.recordExpiredLeaseFailure(now);
        }
        if (job.getFailureCount() >= maxAttempts) {
            return Optional.of(expiredLease ? jobRepository.saveAndFlush(job) : job);
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
        boolean pendingDue = job.getStatus() == IngestionJobStatus.PENDING
                && (job.getNextAttemptAt() == null || !job.getNextAttemptAt().isAfter(now));
        boolean expiredLease = isExpiredLease(job, now);
        if (!pendingDue && !expiredLease) {
            return Optional.empty();
        }
        if (expiredLease) {
            job.recordExpiredLeaseFailure(now);
        }
        if (job.getFailureCount() >= maxAttempts) {
            return Optional.of(expiredLease ? jobRepository.saveAndFlush(job) : job);
        }
        job.claim(now, leaseUntil);
        return Optional.of(jobRepository.saveAndFlush(job));
    }

    @Transactional
    public boolean renewClaim(IngestionClaim claim, Instant now, Instant leaseUntil) {
        if (claim == null || now == null || leaseUntil == null || !leaseUntil.isAfter(now)) {
            return false;
        }
        Duration leaseDuration = Duration.between(now, leaseUntil);
        Optional<IngestionJobEntity> found = jobRepository.findForUpdateByIdAndUserId(
                claim.jobId(), claim.userId());
        if (found.isEmpty()) {
            return false;
        }
        IngestionJobEntity job = found.get();
        Instant lockedNow = clock.instant();
        Instant renewedLeaseUntil = lockedNow.plus(leaseDuration);
        if (!sameIdentity(claim, job)
                || !job.renewLease(claim.attemptCount(), lockedNow, renewedLeaseUntil)) {
            return false;
        }
        jobRepository.saveAndFlush(job);
        return true;
    }

    private boolean sameIdentity(IngestionClaim claim, IngestionJobEntity job) {
        return claim.jobId().equals(job.getId())
                && claim.userId().equals(job.getUserId())
                && claim.sourceId().equals(job.getSourceId())
                && claim.generation().equals(job.getGeneration())
                && java.util.Objects.equals(claim.ingestionRevision(), job.getIngestionRevision())
                && java.util.Objects.equals(claim.parsedDocumentId(), job.getParsedDocumentId());
    }

    private boolean isExpiredLease(IngestionJobEntity job, Instant now) {
        return (job.getStatus() == IngestionJobStatus.PARSING
                || job.getStatus() == IngestionJobStatus.INDEXING)
                && job.getLeaseUntil() != null && !job.getLeaseUntil().isAfter(now);
    }

    private IngestionJobReference reference(IngestionJobEntity job) {
        return new IngestionJobReference(job.getId());
    }
}
