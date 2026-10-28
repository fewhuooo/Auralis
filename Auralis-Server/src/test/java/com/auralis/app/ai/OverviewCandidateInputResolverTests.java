package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OverviewCandidateInputResolverTests {
    private final OverviewJobRepository jobs = mock(OverviewJobRepository.class);
    private final OverviewGenerationService generation = mock(OverviewGenerationService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final OverviewCandidateInputResolver resolver = new OverviewCandidateInputResolver(
            jobs, generation, jdbc, new ObjectMapper());

    @Test
    void rejectsStaleCandidateVersionBeforeSnapshotOrPlanLookup() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        when(jobs.get(userId, jobId)).thenReturn(completedSourceJob(userId, sourceId, jobId, 8));

        DomainException failure = catchThrowableOfType(() -> resolver.resolve(userId, "SOURCE", sourceId,
                OverviewMode.ALL, new OverviewResultCommand.CandidateInput(jobId, 7)), DomainException.class);

        assertThat(failure).isNotNull();
        assertThat(failure.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
        verify(jobs).get(userId, jobId);
        verifyNoInteractions(generation, jdbc);
    }

    @Test
    void rejectsCandidateFromAnotherScopeBeforeReadingRawInputs() {
        UUID userId = UUID.randomUUID();
        UUID jobScopeId = UUID.randomUUID();
        UUID requestedScopeId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        when(jobs.get(userId, jobId)).thenReturn(completedSourceJob(userId, jobScopeId, jobId, 8));

        DomainException failure = catchThrowableOfType(() -> resolver.resolve(userId, "SOURCE", requestedScopeId,
                OverviewMode.ALL, new OverviewResultCommand.CandidateInput(jobId, 8)), DomainException.class);

        assertThat(failure).isNotNull();
        assertThat(failure.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
        verify(jobs).get(userId, jobId);
        verifyNoInteractions(generation, jdbc);
    }

    @Test
    void rejectsOutlineJobWhenRequestAttemptsAllAdoption() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        var request = new OverviewJobDtos.StartRequest(UUID.randomUUID(), OverviewJobDtos.Scope.SUBJECT,
                null, subjectId, java.util.List.of(sourceId), OverviewJobDtos.Mode.OUTLINE, null);
        var row = new OverviewJobRepository.JobRow(jobId, userId, UUID.randomUUID(), UUID.randomUUID(),
                "SUBJECT", subjectId, "OUTLINE", "a".repeat(64), new ObjectMapper().writeValueAsString(request),
                "[]", "b".repeat(64), "c".repeat(64), "algorithm", UUID.randomUUID(), null,
                OverviewJobDtos.Status.COMPLETED, OverviewJobDtos.Stage.COMPLETE, 1, 1, 8, null, 0,
                null, null, false, false, "{}", null, null, null, null, 0, null, null);
        when(jobs.get(userId, jobId)).thenReturn(row);

        DomainException failure = catchThrowableOfType(() -> resolver.resolve(userId, "SUBJECT", subjectId,
                OverviewMode.ALL, new OverviewResultCommand.CandidateInput(jobId, 8)), DomainException.class);

        assertThat(failure).isNotNull();
        assertThat(failure.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
        verifyNoInteractions(generation, jdbc);
    }

    private static OverviewJobRepository.JobRow completedSourceJob(UUID userId, UUID sourceId, UUID jobId, int version) {
        return new OverviewJobRepository.JobRow(jobId, userId, UUID.randomUUID(), UUID.randomUUID(),
                "SOURCE", sourceId, "ALL", "a".repeat(64), "{}", "[]", "b".repeat(64), "c".repeat(64),
                "algorithm", UUID.randomUUID(), null, OverviewJobDtos.Status.COMPLETED,
                OverviewJobDtos.Stage.COMPLETE, 1, 1, version, null, 0, null, null,
                false, false, "{}", null, null, null, null, 0, null, null);
    }
}
