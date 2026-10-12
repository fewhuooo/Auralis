package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.ai.retrieval.SourceChunkService;
import com.auralis.app.source.SourceService;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Map;

@Service
public class IngestionCompletionService {

    private static final String STALE_CODE = "INGESTION_REVISION_STALE";
    private static final String STALE_DETAIL = "Ingestion result no longer owns the current source revision";

    private final SourceService sourceService;
    private final IngestionJobRepository jobRepository;
    private final SourceChunkService chunkService;
    private final Clock clock;

    public IngestionCompletionService(
            SourceService sourceService,
            IngestionJobRepository jobRepository,
            SourceChunkService chunkService,
            Clock clock) {
        this.sourceService = sourceService;
        this.jobRepository = jobRepository;
        this.chunkService = chunkService;
        this.clock = clock;
    }

    @Transactional
    public boolean complete(
            IngestionClaim claim,
            java.util.UUID sourceRevision,
            List<TextChunk> chunks,
            List<List<Double>> vectors,
            Instant now) {
        boolean currentRevision = sourceService.lockIngestionRevision(
                claim.userId(), claim.sourceId(), sourceRevision);
        Optional<IngestionJobEntity> locked = lockOwnedClaim(claim);
        if (locked.isEmpty()) {
            return false;
        }
        IngestionJobEntity job = locked.get();
        if (!currentRevision || !jobRevisionMatches(job, sourceRevision)) {
            failStale(job, now);
            return false;
        }
        if (!sourceService.markReadyIfRevision(claim.userId(), claim.sourceId(), sourceRevision)) {
            failStale(job, now);
            return false;
        }
        chunkService.replace(claim.userId(), claim.sourceId(), claim.generation(), chunks, vectors);
        job.markReady(now);
        jobRepository.saveAndFlush(job);
        return true;
    }

    @Transactional
    public Map<Integer, List<Double>> loadCheckpoint(
            IngestionClaim claim, java.util.UUID sourceRevision, List<TextChunk> chunks) {
        boolean currentRevision = sourceService.lockIngestionRevision(
                claim.userId(), claim.sourceId(), sourceRevision);
        Optional<IngestionJobEntity> locked = lockOwnedClaim(claim);
        if (!currentRevision || locked.isEmpty() || !jobRevisionMatches(locked.get(), sourceRevision)) {
            throw new DomainException(STALE_CODE, STALE_DETAIL);
        }
        return chunkService.loadCheckpoint(claim.userId(), claim.sourceId(), claim.generation(), chunks);
    }

    @Transactional
    public boolean stageCheckpoint(
            IngestionClaim claim, java.util.UUID sourceRevision, List<TextChunk> chunks,
            List<List<Double>> vectors) {
        boolean currentRevision = sourceService.lockIngestionRevision(
                claim.userId(), claim.sourceId(), sourceRevision);
        Optional<IngestionJobEntity> locked = lockOwnedClaim(claim);
        if (!currentRevision || locked.isEmpty() || !jobRevisionMatches(locked.get(), sourceRevision)) {
            return false;
        }
        chunkService.stageCheckpoint(claim.userId(), claim.sourceId(), claim.generation(), chunks, vectors);
        return true;
    }

    @Transactional
    public boolean defer(
            IngestionClaim claim, java.util.UUID sourceRevision, Instant retryAt, String errorCode) {
        boolean currentRevision = sourceService.lockIngestionRevision(
                claim.userId(), claim.sourceId(), sourceRevision);
        Optional<IngestionJobEntity> locked = lockOwnedClaim(claim);
        if (!currentRevision || locked.isEmpty() || !jobRevisionMatches(locked.get(), sourceRevision)) {
            return false;
        }
        IngestionJobEntity job = locked.get();
        if (!sourceService.markPendingIfRevision(claim.userId(), claim.sourceId(), sourceRevision)) {
            failStale(job, clock.instant());
            return false;
        }
        job.deferUntil(clock.instant(), retryAt, errorCode);
        jobRepository.saveAndFlush(job);
        return true;
    }

    @Transactional
    public boolean fail(
            IngestionClaim claim,
            java.util.UUID sourceRevision,
            Instant now,
            int maxAttempts,
            String errorCode,
            String errorDetail) {
        boolean currentRevision = sourceService.lockIngestionRevision(
                claim.userId(), claim.sourceId(), sourceRevision);
        Optional<IngestionJobEntity> locked = lockOwnedClaim(claim);
        if (locked.isEmpty()) {
            return false;
        }
        IngestionJobEntity job = locked.get();
        if (!currentRevision || !jobRevisionMatches(job, sourceRevision)) {
            failStale(job, now);
            return false;
        }
        if (job.getFailureCount() + 1 < maxAttempts) {
            if (!sourceService.markPendingIfRevision(claim.userId(), claim.sourceId(), sourceRevision)) {
                failStale(job, now);
                return false;
            }
            job.markRetry(now, errorCode, errorDetail);
        } else {
            if (!sourceService.markFailedIfRevision(
                    claim.userId(), claim.sourceId(), sourceRevision, errorCode, errorDetail)) {
                failStale(job, now);
                return false;
            }
            job.markFinalFailure(now, errorCode, errorDetail);
        }
        jobRepository.saveAndFlush(job);
        return true;
    }

    @Transactional
    public boolean failExhausted(IngestionJobEntity exhaustedJob, Instant now, int maxAttempts) {
        boolean currentRevision = exhaustedJob.getIngestionRevision() != null
                && sourceService.lockIngestionRevision(
                        exhaustedJob.getUserId(), exhaustedJob.getSourceId(), exhaustedJob.getIngestionRevision());
        Optional<IngestionJobEntity> locked = jobRepository.findForUpdateByIdAndUserId(
                exhaustedJob.getId(), exhaustedJob.getUserId());
        if (locked.isEmpty()) {
            return false;
        }
        IngestionJobEntity job = locked.get();
        if (!sameIdentity(exhaustedJob, job)
                || job.getAttemptCount() != exhaustedJob.getAttemptCount()
                || job.getFailureCount() < maxAttempts
                || !isClaimable(job, clock.instant())) {
            return false;
        }
        if (currentRevision && job.getIngestionRevision() != null) {
            boolean sourceUpdated = sourceService.markFailedIfRevision(
                    job.getUserId(), job.getSourceId(), job.getIngestionRevision(),
                    "INGESTION_RETRY_EXHAUSTED", "Ingestion retries exhausted");
            if (!sourceUpdated) {
                failStale(job, now);
                return false;
            }
            job.markFailed(now, "INGESTION_RETRY_EXHAUSTED", "Ingestion retries exhausted");
        } else {
            failStale(job, now);
            return false;
        }
        jobRepository.saveAndFlush(job);
        return true;
    }

    private Optional<IngestionJobEntity> lockOwnedClaim(IngestionClaim claim) {
        Optional<IngestionJobEntity> found = jobRepository.findForUpdateByIdAndUserId(
                claim.jobId(), claim.userId());
        if (found.isEmpty()) {
            return Optional.empty();
        }
        IngestionJobEntity job = found.get();
        if (!sameIdentity(claim, job) || !job.ownsClaim(claim.attemptCount(), clock.instant())) {
            return Optional.empty();
        }
        return Optional.of(job);
    }

    private boolean sameIdentity(IngestionClaim claim, IngestionJobEntity job) {
        return Objects.equals(claim.jobId(), job.getId())
                && Objects.equals(claim.userId(), job.getUserId())
                && Objects.equals(claim.sourceId(), job.getSourceId())
                && Objects.equals(claim.generation(), job.getGeneration())
                && Objects.equals(claim.ingestionRevision(), job.getIngestionRevision())
                && Objects.equals(claim.parsedDocumentId(), job.getParsedDocumentId());
    }

    private boolean sameIdentity(IngestionJobEntity expected, IngestionJobEntity actual) {
        return Objects.equals(expected.getId(), actual.getId())
                && Objects.equals(expected.getUserId(), actual.getUserId())
                && Objects.equals(expected.getSourceId(), actual.getSourceId())
                && Objects.equals(expected.getGeneration(), actual.getGeneration())
                && Objects.equals(expected.getIngestionRevision(), actual.getIngestionRevision());
    }

    private boolean jobRevisionMatches(IngestionJobEntity job, java.util.UUID sourceRevision) {
        return job.getIngestionRevision() == null
                || Objects.equals(job.getIngestionRevision(), sourceRevision);
    }

    private boolean isClaimable(IngestionJobEntity job, Instant now) {
        return job.getStatus() == IngestionJobStatus.PENDING
                || ((job.getStatus() == IngestionJobStatus.PARSING
                        || job.getStatus() == IngestionJobStatus.INDEXING)
                    && job.getLeaseUntil() != null
                    && !job.getLeaseUntil().isAfter(now));
    }

    private void failStale(IngestionJobEntity job, Instant now) {
        job.markFailed(now, STALE_CODE, STALE_DETAIL);
        jobRepository.saveAndFlush(job);
    }
}
