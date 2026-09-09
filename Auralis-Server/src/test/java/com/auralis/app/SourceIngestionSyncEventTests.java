package com.auralis.app;

import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.sync.ChangeLogService;
import com.auralis.app.sync.SyncCursor;
import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SourceIngestionSyncEventTests {

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private ChangeLogService changeLogService;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void publishesEveryActualIngestionChangeAndSkipsRepeatedIdenticalState() {
        var owner = identityService.register(
                "source-sync-events@example.com", "correct horse battery staple", "Source sync events",
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
