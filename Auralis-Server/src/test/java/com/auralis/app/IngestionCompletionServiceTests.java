package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionClaim;
import com.auralis.app.ai.ingestion.IngestionCompletionService;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.ai.retrieval.SourceChunkService;
import com.auralis.app.source.SourceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IngestionCompletionServiceTests {

    @Mock
    private SourceService sourceService;
    @Mock
    private IngestionJobRepository jobRepository;
    @Mock
    private SourceChunkService chunkService;

    private final Instant now = Instant.parse("2026-08-16T12:00:00Z");
    private IngestionCompletionService completionService;
    private UUID userId;
    private UUID sourceId;
    private UUID revision;
    private IngestionJobEntity job;
    private IngestionClaim claim;

    @BeforeEach
    void setUp() {
        completionService = new IngestionCompletionService(sourceService, jobRepository, chunkService,
                Clock.fixed(now, ZoneOffset.UTC));
        userId = UUID.randomUUID();
        sourceId = UUID.randomUUID();
        revision = UUID.randomUUID();
        job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        job.claim(now.minusSeconds(30), now.plusSeconds(300));
        claim = IngestionClaim.from(job);
        lenient().when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenReturn(Optional.of(job));
        lenient().when(jobRepository.saveAndFlush(job)).thenReturn(job);
    }

    @Test
    void oldRevisionCompletionFailsJobWithoutReplacingChunksOrChangingCurrentSource() {
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(false);

        boolean completed = completionService.complete(claim, revision, chunks(), vectors(), now);

        assertThat(completed).isFalse();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.FAILED);
        assertThat(job.getErrorCode()).isEqualTo("INGESTION_REVISION_STALE");
        verify(chunkService, never()).replace(any(), any(), any(), any(), any(), any());
        verify(sourceService, never()).markReadyIfRevision(any(), any(), any());
        verify(sourceService, never()).markPendingIfRevision(any(), any(), any());
        verify(sourceService, never()).markFailedIfRevision(any(), any(), any(), any(), any());
    }

    @Test
    void olderAttemptCannotCommitAfterLeaseWasReclaimed() {
        job.claim(now, now.plusSeconds(300));
        claim = new IngestionClaim(
                job.getId(), userId, sourceId, job.getGeneration(), revision, null, 1);
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);

        boolean completed = completionService.complete(claim, revision, chunks(), vectors(), now);

        assertThat(completed).isFalse();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PARSING);
        assertThat(job.getAttemptCount()).isEqualTo(2);
        verify(chunkService, never()).replace(any(), any(), any(), any(), any(), any());
        verify(sourceService, never()).markReadyIfRevision(any(), any(), any());
        verify(jobRepository, never()).saveAndFlush(any());
    }

    @Test
    void expiredLeaseCannotCommitBeforeAnotherAttemptClaimsTheJob() {
        job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        job.claim(now.minusSeconds(400), now.minusSeconds(1));
        claim = IngestionClaim.from(job);
        when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenReturn(Optional.of(job));
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);

        boolean completed = completionService.complete(claim, revision, chunks(), vectors(), now);

        assertThat(completed).isFalse();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PARSING);
        assertThat(job.getAttemptCount()).isEqualTo(1);
        verify(chunkService, never()).replace(any(), any(), any(), any(), any(), any());
        verify(sourceService, never()).markReadyIfRevision(any(), any(), any());
        verify(jobRepository, never()).saveAndFlush(any());
    }

    @Test
    void leaseExpiringWhileWaitingForLocksCannotCommitOrFailTheJob() {
        IngestionCompletionService lateService = new IngestionCompletionService(
                sourceService, jobRepository, chunkService,
                Clock.fixed(now.plusSeconds(301), ZoneOffset.UTC));
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);

        assertThat(lateService.complete(claim, revision, chunks(), vectors(), now)).isFalse();
        assertThat(lateService.fail(claim, revision, now, 3, "INGESTION_FAILED", "late failure")).isFalse();

        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PARSING);
        verify(chunkService, never()).replace(any(), any(), any(), any(), any(), any());
        verify(sourceService, never()).markReadyIfRevision(any(), any(), any());
        verify(sourceService, never()).markPendingIfRevision(any(), any(), any());
        verify(sourceService, never()).markFailedIfRevision(any(), any(), any(), any(), any());
    }

    @Test
    void completionCommitsSourceChunksAndJobOnlyForCurrentLiveClaim() {
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);
        when(sourceService.markReadyIfRevision(userId, sourceId, revision)).thenReturn(true);

        boolean completed = completionService.complete(claim, revision, chunks(), vectors(), now);

        assertThat(completed).isTrue();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.READY);
        assertThat(job.getLeaseUntil()).isNull();
        verify(chunkService).replace(eq(userId), eq(sourceId), eq(job.getGeneration()), eq(chunks()), eq(vectors()),
                org.mockito.ArgumentMatchers.isNull());
        verify(sourceService).markReadyIfRevision(userId, sourceId, revision);
        verify(jobRepository).saveAndFlush(job);
    }

    @Test
    void staleWorkerFailureCannotReturnNewRevisionToPendingOrFailed() {
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(false);

        boolean applied = completionService.fail(claim, revision, now, 3, "INGESTION_FAILED", "provider failed");

        assertThat(applied).isFalse();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.FAILED);
        assertThat(job.getErrorCode()).isEqualTo("INGESTION_REVISION_STALE");
        verify(sourceService, never()).markPendingIfRevision(any(), any(), any());
        verify(sourceService, never()).markFailedIfRevision(any(), any(), any(), any(), any());
    }

    @Test
    void retryableFailureReturnsOnlyItsCurrentRevisionToPending() {
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);
        when(sourceService.markPendingIfRevision(userId, sourceId, revision)).thenReturn(true);

        boolean applied = completionService.fail(claim, revision, now, 3, "INGESTION_FAILED", "temporary");

        assertThat(applied).isTrue();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(job.getAttemptCount()).isEqualTo(1);
        assertThat(job.getLeaseUntil()).isNull();
        verify(sourceService).markPendingIfRevision(userId, sourceId, revision);
        verify(jobRepository).saveAndFlush(job);
    }

    @Test
    void retryExhaustionUpdatesCurrentSourceAndJobTogether() {
        IngestionJobService jobService = new IngestionJobService(jobRepository, Clock.fixed(now, ZoneOffset.UTC));
        when(jobRepository.findNextClaimable(any(), eq(IngestionJobStatus.PENDING),
                eq(List.of(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)), any()))
                .thenReturn(List.of(job), List.of(job), List.of(job));
        assertThat(jobService.claimNext(now.plusSeconds(301), now.plusSeconds(601), 3)).containsSame(job);
        assertThat(jobService.claimNext(now.plusSeconds(602), now.plusSeconds(902), 3)).containsSame(job);
        assertThat(jobService.claimNext(now.plusSeconds(903), now.plusSeconds(1203), 3)).containsSame(job);
        assertThat(job.getAttemptCount()).isEqualTo(3);
        assertThat(job.getFailureCount()).isEqualTo(3);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(job.getLeaseUntil()).isNull();
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);
        when(sourceService.markFailedIfRevision(
                userId, sourceId, revision, "INGESTION_RETRY_EXHAUSTED", "Ingestion retries exhausted"))
                .thenReturn(true);

        boolean failed = completionService.failExhausted(job, now, 3);

        assertThat(failed).isTrue();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.FAILED);
        assertThat(job.getErrorCode()).isEqualTo("INGESTION_RETRY_EXHAUSTED");
        verify(sourceService).markFailedIfRevision(
                userId, sourceId, revision, "INGESTION_RETRY_EXHAUSTED", "Ingestion retries exhausted");
        verify(jobRepository, times(4)).saveAndFlush(job);
    }

    @Test
    void failExhaustedDoesNotTerminalizeBelowFailureThreshold() {
        when(sourceService.lockIngestionRevision(userId, sourceId, revision)).thenReturn(true);
        when(sourceService.markPendingIfRevision(userId, sourceId, revision)).thenReturn(true, true);

        boolean firstFailure = completionService.fail(
                claim, revision, now, 3, "INGESTION_FAILED", "attempt one");
        IngestionJobService jobService = new IngestionJobService(jobRepository, Clock.fixed(now, ZoneOffset.UTC));
        assertThat(jobService.claimById(
                userId, job.getId(), now.plusSeconds(1), now.plusSeconds(301), 3)).containsSame(job);
        IngestionClaim secondClaim = IngestionClaim.from(job);
        boolean secondFailure = completionService.fail(
                secondClaim, revision, now.plusSeconds(2), 3, "INGESTION_FAILED", "attempt two");

        boolean failed = completionService.failExhausted(job, now.plusSeconds(903), 3);

        assertThat(firstFailure).isTrue();
        assertThat(secondFailure).isTrue();
        assertThat(failed).isFalse();
        assertThat(job.getAttemptCount()).isEqualTo(2);
        assertThat(job.getFailureCount()).isEqualTo(2);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(job.getLeaseUntil()).isNull();
        verify(sourceService, times(2)).markPendingIfRevision(userId, sourceId, revision);
        verify(sourceService, never()).markFailedIfRevision(any(), any(), any(), any(), any());
        verify(jobRepository, times(3)).saveAndFlush(job);
    }

    private List<TextChunk> chunks() {
        return List.of(new TextChunk(0, "text", 0, 4));
    }

    private List<List<Double>> vectors() {
        return List.of(List.of(0.1, 0.2));
    }
}
