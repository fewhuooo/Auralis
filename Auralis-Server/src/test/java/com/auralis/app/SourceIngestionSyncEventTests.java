package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.sync.ChangeLogService;
import com.auralis.app.sync.SyncCursor;
import com.auralis.app.sync.SyncMutation;
import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import com.auralis.app.sync.SyncService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;
import java.util.List;
import java.time.Instant;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SourceIngestionSyncEventTests {

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private ChangeLogService changeLogService;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private IngestionJobRepository ingestionJobRepository;
    @Autowired private SourceRepository sourceRepository;
    @Autowired private SyncService syncService;
    @MockitoSpyBean private IngestionJobService ingestionJobService;

    @Test
    void failedTransactionalEnqueueRollsBackSourceAndChangeLog() {
        var owner = AuthTestAccounts.register(identityService, "sx-" + UUID.randomUUID() + "@e.test",
                "correct horse battery staple",
                new DeviceCommand("source-enqueue-failure-device", "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Enqueue rollback", null, null, "001"));
        SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "Notes", null, null, "old body", null));
        long baselineCursor = changeLogService.latestCursor(owner.user().id()).value();
        UUID committedRevision = source.ingestionRevision();

        doThrow(new DomainException("INGESTION_ENQUEUE_FAILED", "injected ingestion enqueue failure"))
                .when(ingestionJobService).enqueueServerOwnedSource(
                        eq(owner.user().id()), eq(source.id()), any(UUID.class));

        assertThatThrownBy(() -> sourceService.update(
                owner.user().id(), source.id(), source.version(), new SourceCommand(
                        subject.id(), SourceType.TEXT, "Notes", null, null, "new body", null)))
                .isInstanceOf(DomainException.class)
                .hasMessage("injected ingestion enqueue failure");

        SourceView persisted = sourceService.get(owner.user().id(), source.id());
        assertThat(persisted.rawText()).isEqualTo("old body");
        assertThat(persisted.ingestionRevision()).isEqualTo(committedRevision);
        assertThat(persisted.ingestionStatus()).isEqualTo(SourceIngestionStatus.PENDING);
        assertThat(ingestionJobRepository.findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatusInOrderByCreatedAtDesc(
                owner.user().id(), source.id(), committedRevision,
                java.util.List.of(IngestionJobStatus.PENDING, IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING)))
                .isPresent();
        assertThat(changeLogService.pull(owner.user().id(), new SyncCursor(baselineCursor), 10).changes()).isEmpty();
    }

    @Test
    void textAndUrlSourcesPersistOneJobForTheirCurrentRevision() {
        var owner = AuthTestAccounts.register(identityService, "source-jobs-" + UUID.randomUUID() + "@e.test", "correct horse battery staple",
                new DeviceCommand("source-jobs-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Source jobs", null, null, "001"));

        SourceView text = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "Text job", null, null, "first", null));
        SourceView updatedText = sourceService.update(owner.user().id(), text.id(), text.version(), new SourceCommand(
                subject.id(), SourceType.TEXT, "Text job", null, null, "second", null));
        SourceView titleOnlyUpdate = sourceService.update(
                owner.user().id(), updatedText.id(), updatedText.version(), new SourceCommand(
                        subject.id(), SourceType.TEXT, "Renamed text job", null, null, "second", null));
        SourceView url = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.URL, "URL job", null, "https://example.com/page", null, null));

        assertThat(ingestionJobRepository.findAll().stream()
                .filter(job -> owner.user().id().equals(job.getUserId()))
                .filter(job -> text.id().equals(job.getSourceId()))
                .filter(job -> job.getIngestionRevision().equals(text.ingestionRevision())))
                .hasSize(1);
        assertThat(ingestionJobRepository.findAll().stream()
                .filter(job -> owner.user().id().equals(job.getUserId()))
                .filter(job -> text.id().equals(job.getSourceId()))
                .filter(job -> job.getIngestionRevision().equals(titleOnlyUpdate.ingestionRevision())))
                .hasSize(1);
        assertThat(updatedText.ingestionRevision()).isNotEqualTo(text.ingestionRevision());
        assertThat(titleOnlyUpdate.ingestionRevision()).isEqualTo(updatedText.ingestionRevision());
        assertThat(ingestionJobRepository.findAll().stream()
                .filter(job -> owner.user().id().equals(job.getUserId()))
                .filter(job -> url.id().equals(job.getSourceId()))
                .filter(job -> job.getIngestionRevision().equals(url.ingestionRevision())))
                .hasSize(1);
    }

    @Test
    void syncRestoreRequeuesTerminalJobsForServerOwnedInProgressSourcesOnly() {
        var owner = AuthTestAccounts.register(identityService, "source-restore-sync-" + UUID.randomUUID() + "@e.test",
                "correct horse battery staple",
                new DeviceCommand("source-restore-sync-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Restore in progress", null, null, "001"));

        for (SourceIngestionStatus status : List.of(
                SourceIngestionStatus.PENDING, SourceIngestionStatus.PARSING, SourceIngestionStatus.INDEXING)) {
            SourceType sourceType = status == SourceIngestionStatus.INDEXING ? SourceType.URL : SourceType.TEXT;
            SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                    subject.id(), sourceType, "Restore " + status, null,
                    sourceType == SourceType.URL ? "https://example.com/restore" : null,
                    sourceType == SourceType.TEXT ? "body " + status : null, null));
            if (status != SourceIngestionStatus.PENDING) {
                source = sourceService.markParsing(owner.user().id(), source.id());
            }
            if (status == SourceIngestionStatus.INDEXING) {
                source = sourceService.markIndexing(owner.user().id(), source.id());
            }
            UUID sourceId = source.id();
            UUID revision = source.ingestionRevision();
            sourceService.delete(owner.user().id(), sourceId, source.version());

            var staleJob = ingestionJobRepository.findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(
                    owner.user().id(), sourceId).orElseThrow();
            UUID staleJobId = staleJob.getId();
            staleJob.markFailed(Instant.now(), "INGESTION_FAILED", "simulated terminal job while deleted");
            ingestionJobRepository.saveAndFlush(staleJob);
            long deletedVersion = sourceRepository.findById(sourceId).orElseThrow().getVersion();

            var response = syncService.push(owner.user().id(), owner.serverDeviceId(), List.of(new SyncMutation(
                    "restore-" + UUID.randomUUID(), SyncResourceType.SOURCE, sourceId,
                    SyncMutationType.RESTORE, deletedVersion, null))).getFirst();

            assertThat(response.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
            SourceView restored = sourceService.get(owner.user().id(), sourceId);
            assertThat(restored.ingestionStatus()).isEqualTo(status);
            assertThat(restored.ingestionRevision()).isEqualTo(revision);
            assertThat(ingestionJobRepository.findAll().stream()
                    .filter(job -> owner.user().id().equals(job.getUserId()))
                    .filter(job -> sourceId.equals(job.getSourceId()))
                    .filter(IngestionJobEntity::isActive)
                    .filter(job -> revision.equals(job.getIngestionRevision())))
                    .hasSize(1);
            assertThat(ingestionJobRepository.findAll().stream()
                    .filter(job -> owner.user().id().equals(job.getUserId()))
                    .filter(job -> sourceId.equals(job.getSourceId()))
                    .filter(IngestionJobEntity::isActive)
                    .filter(job -> revision.equals(job.getIngestionRevision()))
                    .findFirst().orElseThrow().getId())
                    .isNotEqualTo(staleJobId);
        }

        for (SourceIngestionStatus terminalStatus : List.of(
                SourceIngestionStatus.READY, SourceIngestionStatus.FAILED)) {
            SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                    subject.id(), SourceType.TEXT, "Restore " + terminalStatus, null, null,
                    "body " + terminalStatus, null));
            source = terminalStatus == SourceIngestionStatus.READY
                    ? sourceService.markReady(owner.user().id(), source.id())
                    : sourceService.markFailed(owner.user().id(), source.id(), "INGESTION_FAILED", "explicit failure");
            UUID sourceId = source.id();
            UUID revision = source.ingestionRevision();
            sourceService.delete(owner.user().id(), sourceId, source.version());
            var oldJob = ingestionJobRepository.findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(
                    owner.user().id(), sourceId).orElseThrow();
            oldJob.markFailed(Instant.now(), "INGESTION_FAILED", "simulated terminal job while deleted");
            ingestionJobRepository.saveAndFlush(oldJob);
            long deletedVersion = sourceRepository.findById(sourceId).orElseThrow().getVersion();

            var response = syncService.push(owner.user().id(), owner.serverDeviceId(), List.of(new SyncMutation(
                    "restore-terminal-" + UUID.randomUUID(), SyncResourceType.SOURCE, sourceId,
                    SyncMutationType.RESTORE, deletedVersion, null))).getFirst();

            assertThat(response.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
            SourceView restored = sourceService.get(owner.user().id(), sourceId);
            assertThat(restored.ingestionStatus()).isEqualTo(terminalStatus);
            assertThat(restored.ingestionRevision()).isEqualTo(revision);
            assertThat(ingestionJobRepository.findAll().stream()
                    .filter(job -> owner.user().id().equals(job.getUserId()))
                    .filter(job -> sourceId.equals(job.getSourceId()))
                    .filter(IngestionJobEntity::isActive))
                    .isEmpty();
        }
    }

    @Test
    void publishesEveryActualIngestionChangeAndSkipsRepeatedIdenticalState() {
        var owner = AuthTestAccounts.register(identityService, "source-sync-events@example.com", "correct horse battery staple",
                new DeviceCommand("source-sync-events-device", "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Ingestion sync", null, null, "001"));
        SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "sync source", null, null, "body", null));

        assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.PARSING,
                null, null, () -> sourceService.markParsing(owner.user().id(), source.id()));
        assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.PENDING,
                null, null, () -> sourceService.markPending(owner.user().id(), source.id()));
        assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.INDEXING,
                null, null, () -> sourceService.markIndexing(owner.user().id(), source.id()));
        assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.READY,
                null, null, () -> sourceService.markReady(owner.user().id(), source.id()));
        assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.FAILED,
                "INGESTION_FAILED", "first failure",
                () -> sourceService.markFailed(owner.user().id(), source.id(),
                        "INGESTION_FAILED", "first failure"));
        assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.FAILED,
                "MODEL_UNAVAILABLE", "first failure",
                () -> sourceService.markFailed(owner.user().id(), source.id(),
                        "MODEL_UNAVAILABLE", "first failure"));
        SourceView lastChanged = assertTransition(owner.user().id(), source.id(), SourceIngestionStatus.FAILED,
                "MODEL_UNAVAILABLE", "provider unavailable",
                () -> sourceService.markFailed(owner.user().id(), source.id(),
                        "MODEL_UNAVAILABLE", "provider unavailable"));

        long noOpCursor = changeLogService.latestCursor(owner.user().id()).value();
        var noOpUpdatedAt = sourceService.get(owner.user().id(), source.id()).updatedAt();
        SourceView noOp = sourceService.markFailed(owner.user().id(), source.id(),
                "MODEL_UNAVAILABLE", "provider unavailable");

        assertThat(noOp.version()).isEqualTo(lastChanged.version());
        assertThat(noOp.updatedAt()).isEqualTo(noOpUpdatedAt);
        assertThat(sourceService.get(owner.user().id(), source.id()).version()).isEqualTo(lastChanged.version());
        assertThat(sourceService.get(owner.user().id(), source.id()).updatedAt()).isEqualTo(noOpUpdatedAt);
        assertThat(changeLogService.latestCursor(owner.user().id()).value()).isEqualTo(noOpCursor);
        assertThat(changeLogService.pull(owner.user().id(), new SyncCursor(noOpCursor), 10).changes()).isEmpty();
    }

    private SourceView assertTransition(
            UUID userId,
            UUID sourceId,
            SourceIngestionStatus expectedStatus,
            String expectedErrorCode,
            String expectedErrorDetail,
            Supplier<SourceView> transition) {
        long baselineCursor = changeLogService.latestCursor(userId).value();

        SourceView returned = transition.get();
        SourceView persisted = sourceService.get(userId, sourceId);

        assertThat(returned.id()).isEqualTo(persisted.id());
        assertThat(returned.version()).isEqualTo(persisted.version());
        assertThat(returned.ingestionStatus()).isEqualTo(persisted.ingestionStatus());
        assertThat(returned.safeErrorCode()).isEqualTo(persisted.safeErrorCode());
        assertThat(returned.safeErrorDetail()).isEqualTo(persisted.safeErrorDetail());
        assertThat(persisted.ingestionStatus()).isEqualTo(expectedStatus);
        assertThat(persisted.safeErrorCode()).isEqualTo(expectedErrorCode);
        assertThat(persisted.safeErrorDetail()).isEqualTo(expectedErrorDetail);
        assertThat(changeLogService.pull(userId, new SyncCursor(baselineCursor), 10).changes())
                .singleElement()
                .satisfies(change -> {
                    assertThat(change.cursor()).isEqualTo(baselineCursor + 1);
                    assertThat(change.resourceType()).isEqualTo(SyncResourceType.SOURCE);
                    assertThat(change.resourceId()).isEqualTo(sourceId);
                    assertThat(change.mutationType()).isEqualTo(SyncMutationType.UPDATE);
                    assertThat(change.version()).isEqualTo(persisted.version());
                    try {
                        assertThat(change.payload()).isEqualTo(objectMapper.writeValueAsString(returned));
                    } catch (Exception exception) {
                        throw new AssertionError("Source change payload must be valid JSON", exception);
                    }
                });
        return persisted;
    }
}
