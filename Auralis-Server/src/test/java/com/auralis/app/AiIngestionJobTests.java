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
        IngestionJobEntity existing = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING);
        when(jobRepository.findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(userId, sourceId))
                .thenReturn(Optional.of(existing));

        IngestionJobEntity result = jobService.enqueue(userId, sourceId);

        assertThat(result).isSameAs(existing);
        verify(jobRepository, never()).save(any());
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
    void exhaustedExpiredLeaseBecomesTerminalFailure() {
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
        when(jobRepository.saveAndFlush(job)).thenReturn(job);

        Optional<IngestionJobEntity> result = jobService.claimNext(now, now.plusSeconds(300), 3);

        assertThat(result).containsSame(job);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.FAILED);
        assertThat(job.getErrorCode()).isEqualTo("INGESTION_RETRY_EXHAUSTED");
    }
}
