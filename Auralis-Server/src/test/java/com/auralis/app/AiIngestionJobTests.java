package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionClaim;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

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
    @Mock
    private Clock clock;

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
    void quotaDeferralKeepsClaimFenceAndOrdinaryFailureCountUntouched() {
        IngestionJobEntity job = new IngestionJobEntity(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                IngestionJobStatus.PENDING);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        job.claim(now, now.plusSeconds(60));
        job.deferUntil(now.plusSeconds(1), now.plusSeconds(3600), "AI_HOURLY_QUOTA_EXCEEDED");

        assertThat(job.getAttemptCount()).isEqualTo(1);
        assertThat(job.getFailureCount()).isZero();
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(job.getNextAttemptAt()).isEqualTo(now.plusSeconds(3600));
        assertThat(job.getLeaseUntil()).isNull();
    }

    @Test
    void claimByIdDoesNotClaimBeforeQuotaDeferralWindow() {
        UUID userId = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(UUID.randomUUID(), userId, UUID.randomUUID(),
                IngestionJobStatus.PENDING);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        job.deferUntil(now, now.plusSeconds(30), "AI_DAILY_QUOTA_EXCEEDED");
        when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenReturn(Optional.of(job));

        Optional<IngestionJobEntity> result = jobService.claimById(
                userId, job.getId(), now, now.plusSeconds(60), 3);

        assertThat(result).isEmpty();
        assertThat(job.getAttemptCount()).isZero();
        verify(jobRepository, never()).saveAndFlush(any());
    }

    @Test
    void exhaustedExpiredLeaseIsReturnedForFencedTerminalization() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        job.claim(now.minusSeconds(900), now.minusSeconds(600));
        job.markRetry(now.minusSeconds(600), "INGESTION_FAILED", "failed attempt one");
        job.claim(now.minusSeconds(600), now.minusSeconds(300));
        job.markRetry(now.minusSeconds(300), "INGESTION_FAILED", "failed attempt two");
        job.claim(now.minusSeconds(100), now.minusSeconds(1));
        when(jobRepository.findNextClaimable(
                eq(now), eq(IngestionJobStatus.PENDING), eq(List.of(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)), any()))
                .thenReturn(List.of(job));
        when(jobRepository.saveAndFlush(job)).thenReturn(job);

        Optional<IngestionJobEntity> result = jobService.claimNext(now, now.plusSeconds(300), 3);

        assertThat(result).containsSame(job);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(job.getAttemptCount()).isEqualTo(3);
        assertThat(job.getFailureCount()).isEqualTo(3);
        assertThat(job.getLeaseUntil()).isNull();
        verify(jobRepository).saveAndFlush(job);
    }

    @Test
    void successiveExpiredClaimsConsumeFailureBudgetAndDoNotResetClaimFence() {
        IngestionJobEntity job = new IngestionJobEntity(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                IngestionJobStatus.PENDING);
        Instant start = Instant.parse("2026-08-16T12:00:00Z");
        when(jobRepository.findNextClaimable(any(), eq(IngestionJobStatus.PENDING),
                eq(List.of(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)), any()))
                .thenReturn(List.of(job), List.of(job), List.of(job), List.of(job));
        when(jobRepository.saveAndFlush(job)).thenReturn(job);

        assertThat(jobService.claimNext(start, start.plusSeconds(5), 3)).containsSame(job);
        assertThat(job.getAttemptCount()).isEqualTo(1);
        assertThat(jobService.claimNext(start.plusSeconds(10), start.plusSeconds(15), 3)).containsSame(job);
        assertThat(job.getAttemptCount()).isEqualTo(2);
        assertThat(jobService.claimNext(start.plusSeconds(20), start.plusSeconds(25), 3)).containsSame(job);
        assertThat(job.getAttemptCount()).isEqualTo(3);
        assertThat(job.getFailureCount()).isEqualTo(2);
        assertThat(job.getLeaseUntil()).isEqualTo(start.plusSeconds(25));
        assertThat(jobService.claimNext(start.plusSeconds(30), start.plusSeconds(35), 3)).containsSame(job);
        assertThat(job.getAttemptCount()).isEqualTo(3);
        assertThat(job.getFailureCount()).isEqualTo(3);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(job.getLeaseUntil()).isNull();
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

    @Test
    void renewClaimExtendsOnlyTheSameUnexpiredAttempt() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        when(clock.instant()).thenReturn(now.plusSeconds(10), now.plusSeconds(311), now.plusSeconds(313));
        job.claim(now, now.plusSeconds(30));
        IngestionClaim claim = IngestionClaim.from(job);
        when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenReturn(Optional.of(job));
        when(jobRepository.saveAndFlush(job)).thenReturn(job);

        assertThat(jobService.renewClaim(claim, now.plusSeconds(10), now.plusSeconds(310))).isTrue();
        assertThat(job.getLeaseUntil()).isEqualTo(now.plusSeconds(310));

        assertThat(jobService.renewClaim(claim, now.plusSeconds(311), now.plusSeconds(611))).isFalse();
        assertThat(job.getLeaseUntil()).isEqualTo(now.plusSeconds(310));
        verify(jobRepository, org.mockito.Mockito.times(1)).saveAndFlush(job);

        job.claim(now.plusSeconds(312), now.plusSeconds(612));
        assertThat(jobService.renewClaim(claim, now.plusSeconds(313), now.plusSeconds(913))).isFalse();
        assertThat(job.getAttemptCount()).isEqualTo(2);
        assertThat(job.getLeaseUntil()).isEqualTo(now.plusSeconds(612));
        verify(jobRepository, org.mockito.Mockito.times(3)).findForUpdateByIdAndUserId(job.getId(), userId);
    }

    @Test
    void renewalCannotResurrectAClaimAfterAnotherWorkerReclaimsIt() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        Instant now = Instant.parse("2026-08-16T12:00:00Z");
        job.claim(now.minusSeconds(30), now.minusSeconds(1));
        IngestionClaim oldClaim = IngestionClaim.from(job);
        when(clock.instant()).thenReturn(now);
        CountDownLatch renewalLookupStarted = new CountDownLatch(1);
        CountDownLatch replacementAttemptClaimed = new CountDownLatch(1);
        AtomicInteger lookups = new AtomicInteger();
        when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenAnswer(invocation -> {
            if (lookups.getAndIncrement() == 0) {
                renewalLookupStarted.countDown();
                if (!replacementAttemptClaimed.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("replacement attempt did not claim the job");
                }
                return Optional.of(job);
            }
            return Optional.of(job);
        });
        when(jobRepository.saveAndFlush(job)).thenReturn(job);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            var oldWorkerRenewal = executor.submit(() -> jobService.renewClaim(
                    oldClaim, now, now.plusSeconds(300)));
            assertThat(renewalLookupStarted.await(5, TimeUnit.SECONDS)).isTrue();

            Optional<IngestionJobEntity> replacement =
                    jobService.claimById(userId, job.getId(), now, now.plusSeconds(300), 3);
            replacementAttemptClaimed.countDown();

            assertThat(replacement).containsSame(job);
            assertThat(job.getAttemptCount()).isEqualTo(2);
            assertThat(oldWorkerRenewal.get(5, TimeUnit.SECONDS)).isFalse();
            assertThat(job.getLeaseUntil()).isEqualTo(now.plusSeconds(300));
            verify(jobRepository).saveAndFlush(job);
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void renewalDoesNotUseWorkerTimeCapturedBeforeWaitingForTheJobLock() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING,
                UUID.randomUUID(), revision);
        Instant startedAt = Instant.parse("2026-08-16T12:00:00Z");
        job.claim(startedAt, startedAt.plusSeconds(300));
        IngestionClaim claim = IngestionClaim.from(job);
        Instant workerCapturedNow = startedAt.plusSeconds(299);
        AtomicReference<Instant> databaseNow = new AtomicReference<>(workerCapturedNow);
        when(clock.instant()).thenAnswer(invocation -> databaseNow.get());
        when(jobRepository.findForUpdateByIdAndUserId(job.getId(), userId)).thenAnswer(invocation -> {
            databaseNow.set(startedAt.plusSeconds(301));
            return Optional.of(job);
        });

        boolean renewed = jobService.renewClaim(
                claim, workerCapturedNow, workerCapturedNow.plusSeconds(300));

        assertThat(renewed).isFalse();
        assertThat(job.getLeaseUntil()).isEqualTo(startedAt.plusSeconds(300));
        verify(jobRepository, never()).saveAndFlush(job);
    }
}
