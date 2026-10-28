package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OverviewJobServiceTests {
    private OverviewJobRepository repository;
    private OverviewGenerationService generationService;
    private OverviewJobInvocationJournal invocationJournal;
    private ObjectMapper objectMapper;
    private OverviewJobService service;

    @BeforeEach
    void setUp() {
        repository = mock(OverviewJobRepository.class);
        generationService = mock(OverviewGenerationService.class);
        invocationJournal = mock(OverviewJobInvocationJournal.class);
        objectMapper = mock(ObjectMapper.class);
        service = new OverviewJobService(repository, generationService, invocationJournal,
                objectMapper, Clock.systemUTC());
    }

    @Test
    void sourceScopeRejectsSubjectFieldsBeforeSnapshotOrProviderWork() {
        OverviewJobDtos.StartRequest request = new OverviewJobDtos.StartRequest(UUID.randomUUID(),
                OverviewJobDtos.Scope.SOURCE, UUID.randomUUID(), UUID.randomUUID(), null,
                OverviewJobDtos.Mode.OUTLINE, null);

        assertThatThrownBy(() -> service.start(UUID.randomUUID(), request))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("SOURCE scope accepts sourceId only");
        verifyNoInteractions(generationService);
    }

    @Test
    void subjectScopeRequiresOneToOneHundredUniqueSources() {
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        OverviewJobDtos.StartRequest empty = new OverviewJobDtos.StartRequest(UUID.randomUUID(),
                OverviewJobDtos.Scope.SUBJECT, null, subjectId, List.of(), OverviewJobDtos.Mode.ALL, null);
        OverviewJobDtos.StartRequest duplicated = new OverviewJobDtos.StartRequest(UUID.randomUUID(),
                OverviewJobDtos.Scope.SUBJECT, null, subjectId, List.of(sourceId, sourceId), OverviewJobDtos.Mode.ALL, null);

        assertThatThrownBy(() -> service.start(UUID.randomUUID(), empty))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("1..100 unique sourceIds");
        assertThatThrownBy(() -> service.start(UUID.randomUUID(), duplicated))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("1..100 unique sourceIds");
        verifyNoInteractions(generationService);
    }

    @Test
    void nullDeadlineExecutesBackgroundGenerationWithZeroRemainingMillis() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID generationRequestId = UUID.randomUUID();
        OverviewJobDtos.StartRequest request = new OverviewJobDtos.StartRequest(UUID.randomUUID(),
                OverviewJobDtos.Scope.SOURCE, UUID.randomUUID(), null, null, OverviewJobDtos.Mode.ALL, null);
        OverviewJobRepository.JobLease lease = mock(OverviewJobRepository.JobLease.class);
        when(lease.userId()).thenReturn(userId);
        when(lease.jobId()).thenReturn(jobId);
        OverviewJobRepository.JobRow row = mock(OverviewJobRepository.JobRow.class);
        when(row.lease()).thenReturn(lease);
        when(row.userId()).thenReturn(userId);
        when(row.id()).thenReturn(jobId);
        when(row.status()).thenReturn(OverviewJobDtos.Status.RUNNING);
        when(row.requestJson()).thenReturn("request");
        when(row.requestHash()).thenReturn("request-hash");
        when(row.inputFingerprint()).thenReturn("input");
        when(row.profileFingerprint()).thenReturn("profile");
        when(row.algorithmVersion()).thenReturn("algorithm");
        when(row.sourceManifestJson()).thenReturn("[]");
        when(row.generationRequestId()).thenReturn(generationRequestId);
        when(row.deadlineAt()).thenReturn(null);
        when(objectMapper.readValue("request", OverviewJobDtos.StartRequest.class)).thenReturn(request);
        when(invocationJournal.allSafe(row)).thenReturn(true);
        OverviewJobRepository.Snapshot snapshot = mock(OverviewJobRepository.Snapshot.class);
        when(snapshot.requestHash()).thenReturn("request-hash");
        when(snapshot.inputFingerprint()).thenReturn("input");
        when(snapshot.profileFingerprint()).thenReturn("profile");
        when(snapshot.algorithmVersion()).thenReturn("algorithm");
        when(snapshot.sourceManifestJson()).thenReturn("[]");
        when(generationService.snapshotForJob(userId, request)).thenReturn(snapshot);
        when(repository.get(userId, jobId)).thenReturn(row);

        service.executeClaimed(row, new OverviewCancellation());

        verify(generationService).executeBackgroundJob(eq(userId), eq(request), eq(generationRequestId.toString()),
                eq(0L), eq("profile"), any(OverviewJobExecution.class));
        verify(repository).finish(lease, null);
    }
}
