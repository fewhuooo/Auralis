package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiIngestionJobTests {

    @Mock
    private IngestionJobRepository jobRepository;

    @InjectMocks
    private IngestionJobService jobService;

    @Test
    void enqueueIsIdempotentForTheSameOwnedSource() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        IngestionJobEntity existing = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, UUID.randomUUID(), revision);
        when(jobRepository.findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                userId, sourceId, revision,
                List.of(IngestionJobStatus.PENDING, IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)))
                .thenReturn(Optional.of(existing));

        IngestionJobEntity result = jobService.enqueue(userId, sourceId, revision);

        assertThat(result).isSameAs(existing);
        verify(jobRepository, never()).save(any());
    }

    @Test
    void enqueueCreatesIndependentJobWhenAnOlderRevisionIsStillActive() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID oldRevision = UUID.randomUUID();
        UUID newRevision = UUID.randomUUID();
        IngestionJobEntity oldJob = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.INDEXING,
                UUID.randomUUID(), oldRevision);
        when(jobRepository.findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                userId, sourceId, newRevision,
                List.of(IngestionJobStatus.PENDING, IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)))
                .thenReturn(Optional.empty());
        when(jobRepository.save(any(IngestionJobEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        IngestionJobEntity newJob = jobService.enqueue(userId, sourceId, newRevision);

        assertThat(newJob.getId()).isNotEqualTo(oldJob.getId());
        assertThat(newJob.getIngestionRevision()).isEqualTo(newRevision);
        assertThat(newJob.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(oldJob.getStatus()).isEqualTo(IngestionJobStatus.INDEXING);
    }

    @Test
    void reenqueueAfterTerminalAttemptUsesNewJobIdWithoutResettingOldAttemptFence() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        IngestionJobEntity terminal = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        terminal.claim(now.minusSeconds(30), now.minusSeconds(10));
        terminal.markFailed(now, "INGESTION_FAILED", "failed");
        int oldAttempt = terminal.getAttemptCount();
        when(jobRepository.findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                userId, sourceId, revision,
                List.of(IngestionJobStatus.PENDING, IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)))
                .thenReturn(Optional.empty());
        when(jobRepository.save(any(IngestionJobEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        jobService.enqueueParsedDocument(userId, sourceId, documentId, revision, generation);

        org.mockito.ArgumentCaptor<IngestionJobEntity> saved =
                org.mockito.ArgumentCaptor.forClass(IngestionJobEntity.class);
        verify(jobRepository).save(saved.capture());
        IngestionJobEntity replacement = saved.getValue();
        assertThat(replacement.getId()).isNotEqualTo(terminal.getId());
        assertThat(replacement.getAttemptCount()).isZero();
        assertThat(replacement.getGeneration()).isEqualTo(generation);
        assertThat(replacement.getIngestionRevision()).isEqualTo(revision);
        assertThat(replacement.getParsedDocumentId()).isEqualTo(documentId);
        assertThat(terminal.getAttemptCount()).isEqualTo(oldAttempt);
        assertThat(terminal.getStatus()).isEqualTo(IngestionJobStatus.FAILED);
    }

    @Test
    void claimNextLocksPendingJobAndAssignsLease() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        Instant leaseUntil = now.plusSeconds(300);
        when(jobRepository.findNextClaimable(
                eq(now), eq(IngestionJobStatus.PENDING), eq(List.of(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)), any()))
                .thenReturn(List.of(job));
        when(jobRepository.saveAndFlush(job)).thenReturn(job);

        Optional<IngestionJobEntity> result = jobService.claimNext(now, leaseUntil, 3);

        assertThat(result).containsSame(job);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PARSING);
        assertThat(job.getAttemptCount()).isEqualTo(1);
        assertThat(job.getLeaseUntil()).isEqualTo(leaseUntil);
    }

    @Test
    void exhaustedExpiredLeaseIsReturnedForFencedTerminalization() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        job.claim(now.minusSeconds(600), now.minusSeconds(300));
        job.claim(now.minusSeconds(300), now.minusSeconds(100));
        job.claim(now.minusSeconds(100), now.minusSeconds(1));
        when(jobRepository.findNextClaimable(
                eq(now), eq(IngestionJobStatus.PENDING), eq(List.of(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)), any()))
                .thenReturn(List.of(job));

        Optional<IngestionJobEntity> result = jobService.claimNext(now, now.plusSeconds(300), 3);

        assertThat(result).containsSame(job);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PARSING);
        assertThat(job.getAttemptCount()).isEqualTo(3);
        assertThat(job.getLeaseUntil()).isBefore(now);
        verify(jobRepository, never()).saveAndFlush(any());
    }

    @Test
    void claimByIdWillNotStealAnUnexpiredLeaseButReclaimsAnExpiredLeaseWithANewAttempt() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        job.claim(now.minusSeconds(30), now.plusSeconds(30));
        when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenReturn(Optional.of(job));

        assertThat(jobService.claimById(userId, job.getId(), now, now.plusSeconds(300), 3)).isEmpty();
        assertThat(job.getAttemptCount()).isEqualTo(1);
        verify(jobRepository, never()).saveAndFlush(any());

        job.claim(now.minusSeconds(60), now.minusSeconds(1));
        when(jobRepository.saveAndFlush(job)).thenReturn(job);
        Optional<IngestionJobEntity> reclaimed =
                jobService.claimById(userId, job.getId(), now, now.plusSeconds(300), 3);

        assertThat(reclaimed).containsSame(job);
        assertThat(job.getAttemptCount()).isEqualTo(3);
        assertThat(job.getLeaseUntil()).isEqualTo(now.plusSeconds(300));
    }
}
