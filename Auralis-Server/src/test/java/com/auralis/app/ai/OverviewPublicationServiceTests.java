package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OverviewPublicationServiceTests {
    @Test
    void publishRejectsClientBaseThatDiffersFromEnqueueBaselineBeforeCreatingIntent() {
        OverviewPublicationRepository publications = mock(OverviewPublicationRepository.class);
        OverviewJobRepository jobs = mock(OverviewJobRepository.class);
        OverviewJobService jobService = mock(OverviewJobService.class);
        OverviewGenerationService generationService = mock(OverviewGenerationService.class);
        OverviewResultService resultService = mock(OverviewResultService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID userId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID resultId = UUID.randomUUID();
        when(jobs.get(userId, jobId)).thenReturn(completedJob(jobId, userId, resultId));
        OverviewPublicationService service = new OverviewPublicationService(publications, jobs, jobService,
                generationService, resultService, jdbc, new ObjectMapper(), Clock.systemUTC(),
                mock(PlatformTransactionManager.class));

        assertThatThrownBy(() -> service.publish(userId, jobId,
                new OverviewPublicationDtos.PublishRequest(UUID.randomUUID(), 7, 3)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("captured baseline");

        verify(jobs).get(userId, jobId);
        verifyNoInteractions(publications, jobService, generationService, resultService, jdbc);
    }

    private OverviewJobRepository.JobRow completedJob(UUID jobId, UUID userId, UUID resultId) {
        return new OverviewJobRepository.JobRow(jobId, userId, UUID.randomUUID(), UUID.randomUUID(), "SOURCE",
                UUID.randomUUID(), "ALL", "request-hash", "{}", "[]", "a".repeat(64), "b".repeat(64),
                "overview-adaptive-v5-background-jobs", UUID.randomUUID(), UUID.randomUUID(),
                OverviewJobDtos.Status.COMPLETED, OverviewJobDtos.Stage.COMPLETE, 1, 1, 7,
                null, 1, null, Instant.now().plusSeconds(60), false, false, "{}", null,
                Instant.now(), Instant.now(), Instant.now(), 2, resultId, 3L);
    }
}
