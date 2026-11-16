package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.sync.ChangeLogPage;
import com.auralis.app.sync.ChangeLogService;
import com.auralis.app.sync.MutationDecision;
import com.auralis.app.sync.SyncRetentionService;
import com.auralis.app.sync.SyncCursor;
import com.auralis.app.sync.SyncMutation;
import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import com.auralis.app.sync.SyncService;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.TaskStatus;
import com.auralis.app.task.TaskView;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.List;
import java.time.Instant;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SyncServiceTests {

    @Autowired
    private ChangeLogService changeLogService;

    @Autowired
    private SyncRetentionService syncRetentionService;

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private SyncService syncService;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private KnowledgeBlockService knowledgeBlockService;

    @Autowired
    private SourceService sourceService;

    @Autowired
    private TaskService taskService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @Transactional
    void allocatesMonotonicOwnerScopedCursorsAndPaginates() {
        UUID firstUser = insertUser("sync-first-" + UUID.randomUUID());
        UUID secondUser = insertUser("sync-second-" + UUID.randomUUID());

        changeLogService.record(firstUser, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("first"));
        changeLogService.record(firstUser, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.UPDATE, 1, null, new Payload("second"));
        changeLogService.record(secondUser, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("other"));

        ChangeLogPage page = changeLogService.pull(firstUser, new SyncCursor(0), 1);

        assertThat(page.changes()).hasSize(1);
        assertThat(page.changes().getFirst().cursor()).isEqualTo(1);
        assertThat(page.hasMore()).isTrue();
        assertThat(page.resetRequired()).isFalse();
        assertThat(changeLogService.latestCursor(firstUser).value()).isEqualTo(2);
        assertThat(changeLogService.latestCursor(secondUser).value()).isEqualTo(1);
    }

    @Test
    void allocatesUniqueCursorsForConcurrentOwnerChanges() throws Exception {
        UUID userId = insertUser("sync-concurrent-" + UUID.randomUUID());

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> changeLogService.record(
                    userId, SyncResourceType.TASK, UUID.randomUUID(), SyncMutationType.CREATE,
                    0, null, new Payload("first")).cursor());
            var second = executor.submit(() -> changeLogService.record(
                    userId, SyncResourceType.TASK, UUID.randomUUID(), SyncMutationType.CREATE,
                    0, null, new Payload("second")).cursor());

            assertThat(java.util.stream.Stream.of(first.get(), second.get()).sorted().toList())
                    .containsExactly(1L, 2L);
        }
    }

    @Test
    @Transactional
    void recordsDeletedPayloadAndMutationType() {
        UUID userId = insertUser("sync-delete-" + UUID.randomUUID());
        UUID resourceId = UUID.randomUUID();

        var entry = changeLogService.record(userId, SyncResourceType.KNOWLEDGE_BLOCK, resourceId,
                SyncMutationType.DELETE, 4, java.time.Instant.parse("2026-08-13T00:00:00Z"),
                new Payload("deleted"));

        assertThat(entry.mutationType()).isEqualTo(SyncMutationType.DELETE);
        assertThat(entry.deletedAt()).isNotNull();
        assertThat(entry.payload()).contains("deleted");
    }

    @Test
    void directWriteAndSyncPushShareChangeLogAndReplayIdempotency() {
        AuthResult auth = register("sync-shared");
        UUID resourceId = UUID.randomUUID();
        var payload = objectMapper.createObjectNode()
                .put("name", "Physics")
                .putNull("description")
                .putNull("iconKey")
                .put("sortKey", "001");
        SyncMutation mutation = new SyncMutation("client-1", SyncResourceType.SUBJECT, resourceId,
                SyncMutationType.CREATE, 0, payload);

        var first = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();
        var replay = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();
        subjectService.update(auth.user().id(), resourceId, 0,
                new SubjectCommand("Physics Updated", null, null, "001"));
        var conflict = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("client-2", SyncResourceType.SUBJECT, resourceId,
                        SyncMutationType.UPDATE, 0, payload))).getFirst();

        assertThat(first.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
        assertThat(replay.decision()).isEqualTo(first.decision());
        assertThat(replay.recordedAt()).isEqualTo(first.recordedAt());
        assertThat(conflict.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.CONFLICT);
        assertThat(changeLogService.latestCursor(auth.user().id()).value()).isEqualTo(2);
    }

    @Test
    void editsKnowledgeBlockWithDeletedSourceWhileRejectingInvalidNewLinks() {
        AuthResult auth = register("sync-knowledge");
        UUID userId = auth.user().id();
        UUID subjectId = subjectService.create(userId, new SubjectCommand("Notes", null, null, "001")).id();
        UUID sourceSubjectId = subjectService.create(userId, new SubjectCommand("Sources", null, null, "002")).id();
        var source = sourceService.create(userId, new SourceCommand(
                sourceSubjectId, SourceType.TEXT, "Source", null, null, "Original text", null));
        var linkedBlock = knowledgeBlockService.create(userId, new KnowledgeBlockCommand(
                subjectId, source.id(), "Original", "Original text", null));
        var unlinkedBlock = knowledgeBlockService.create(userId, new KnowledgeBlockCommand(
                subjectId, null, "Unlinked", "Standalone text", null));
        UUID otherUserId = register("sync-knowledge-other").user().id();
        UUID otherSubjectId = subjectService.create(otherUserId,
                new SubjectCommand("Private notes", null, null, "001")).id();
        var otherSource = sourceService.create(otherUserId, new SourceCommand(
                otherSubjectId, SourceType.TEXT, "Private source", null, null, "Private text", null));

        sourceService.delete(userId, source.id(), source.version());
        String beforeEditCursor = syncService.latestCursor(userId).encode();
        var editedPayload = objectMapper.createObjectNode()
                .put("subjectId", subjectId.toString())
                .put("sourceId", source.id().toString())
                .put("title", "Edited")
                .put("content", "Edited text")
                .put("colorOverride", "#112233");
        var applied = syncService.push(userId, auth.serverDeviceId(), List.of(
                new SyncMutation("edit", SyncResourceType.KNOWLEDGE_BLOCK, linkedBlock.id(),
                        SyncMutationType.UPDATE, linkedBlock.version(), editedPayload))).getFirst();

        assertThat(applied.decision()).isEqualTo(MutationDecision.APPLIED);
        var updated = knowledgeBlockService.get(userId, linkedBlock.id());
        assertThat(updated.sourceId()).isEqualTo(source.id());
        assertThat(updated.title()).isEqualTo("Edited");
        assertThat(updated.content()).isEqualTo("Edited text");
        assertThat(updated.colorOverride()).isEqualTo("#112233");
        assertThat(syncService.pull(userId, beforeEditCursor, 10).changes()).singleElement().satisfies(change -> {
            assertThat(change.resourceId()).isEqualTo(linkedBlock.id());
            assertThat(change.mutationType()).isEqualTo(SyncMutationType.UPDATE);
            assertThat(objectMapper.readTree(change.payload()).path("content").asText()).isEqualTo("Edited text");
        });

        var foreignPayload = editedPayload.deepCopy().put("sourceId", otherSource.id().toString());
        var movePayload = editedPayload.deepCopy().put("subjectId", sourceSubjectId.toString());
        var rejections = syncService.push(userId, auth.serverDeviceId(), List.of(
                new SyncMutation("create-deleted-source", SyncResourceType.KNOWLEDGE_BLOCK, UUID.randomUUID(),
                        SyncMutationType.CREATE, 0, editedPayload),
                new SyncMutation("create-foreign-source", SyncResourceType.KNOWLEDGE_BLOCK, UUID.randomUUID(),
                        SyncMutationType.CREATE, 0, foreignPayload),
                new SyncMutation("link-deleted-source", SyncResourceType.KNOWLEDGE_BLOCK, unlinkedBlock.id(),
                        SyncMutationType.UPDATE, unlinkedBlock.version(), editedPayload),
                new SyncMutation("link-foreign-source", SyncResourceType.KNOWLEDGE_BLOCK, unlinkedBlock.id(),
                        SyncMutationType.UPDATE, unlinkedBlock.version(), foreignPayload),
                new SyncMutation("move-with-deleted-source", SyncResourceType.KNOWLEDGE_BLOCK, linkedBlock.id(),
                        SyncMutationType.UPDATE, updated.version(), movePayload)));

        assertThat(rejections).allSatisfy(result -> {
            assertThat(result.decision()).isEqualTo(MutationDecision.REJECTED);
            assertThat(result.code()).isEqualTo("RESOURCE_NOT_FOUND");
        });
    }

    @Test
    void hashMismatchDoesNotAbortTheRemainingPushBatch() {
        AuthResult auth = register("sync-batch");
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        var firstPayload = objectMapper.createObjectNode()
                .put("name", "First")
                .put("sortKey", "001");
        var secondPayload = objectMapper.createObjectNode()
                .put("name", "Second")
                .put("sortKey", "002");

        SyncMutation original = new SyncMutation("same-id", SyncResourceType.SUBJECT, firstId,
                SyncMutationType.CREATE, 0, firstPayload);
        syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(original));

        var results = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("same-id", SyncResourceType.SUBJECT, firstId,
                        SyncMutationType.CREATE, 0, secondPayload),
                new SyncMutation("second-id", SyncResourceType.SUBJECT, secondId,
                        SyncMutationType.CREATE, 0, secondPayload)));

        assertThat(results).hasSize(2);
        assertThat(results.getFirst().decision()).isEqualTo(com.auralis.app.sync.MutationDecision.REJECTED);
        assertThat(results.getFirst().code()).isEqualTo("MUTATION_REJECTED");
        assertThat(results.get(1).decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
    }

    @Test
    void syncTaskCreateRejectsScheduleOverlapAndPersistsRejectedMutation() {
        AuthResult auth = register("sync-task-overlap");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule", null, null, "001")).id();
        java.time.Instant start = java.time.Instant.parse("2026-09-25T08:00:00Z");
        taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "First", null, TaskStatus.TODO, start, null, null, "001"));
        UUID conflictingTaskId = UUID.randomUUID();
        var payload = objectMapper.createObjectNode()
                .put("subjectId", subjectId.toString())
                .put("title", "Overlap")
                .put("status", "TODO")
                .put("scheduledAt", "2026-09-25T08:15:00Z")
                .put("durationMinutes", 30);
        SyncMutation mutation = new SyncMutation("sync-task-overlap-create", SyncResourceType.TASK,
                conflictingTaskId, SyncMutationType.CREATE, 0, payload);

        var result = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();

        assertThat(result.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.REJECTED);
        assertThat(result.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.list(auth.user().id(), null, 200).items()).hasSize(1);
    }

    @Test
    void scheduleInsertionSyncMutationAppliesAtomicallyAndReplaysFullTaskArray() {
        AuthResult auth = register("sync-schedule-insertion");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule insertion", null, null, "001")).id();
        TaskView existing = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Existing", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T09:00:00Z"), null, 60, "001"));
        TaskView source = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Source", null, TaskStatus.TODO,
                null, null, 30, "002"));
        long cursorBefore = changeLogService.latestCursor(auth.user().id()).value();
        var payload = objectMapper.createObjectNode()
                .put("taskId", source.id().toString())
                .put("baseVersion", source.version())
                .put("scheduledAt", "2026-09-25T09:00:00Z")
                .put("windowStartAt", "2026-09-25T08:00:00Z")
                .put("windowLastStartAt", "2026-09-25T22:30:00Z");
        SyncMutation mutation = new SyncMutation("schedule-insertion-1", SyncResourceType.TASK,
                source.id(), SyncMutationType.SCHEDULE_INSERTION, source.version(), payload);

        var first = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();
        var replay = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();

        assertThat(first.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
        assertThat(first.current()).isInstanceOf(tools.jackson.databind.JsonNode.class);
        assertThat((tools.jackson.databind.JsonNode) first.current()).hasSize(2);
        assertThat(replay.current()).isEqualTo(first.current());
        assertThat(replay.changeCursor()).isEqualTo(first.changeCursor());
        assertThat(changeLogService.latestCursor(auth.user().id()).value() - cursorBefore).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from change_log where user_id = ? and cursor > ? and resource_type = 'TASK' and mutation_type = 'UPDATE'",
                Long.class, auth.user().id(), cursorBefore)).isEqualTo(2L);
        assertThat(taskService.get(auth.user().id(), source.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T09:00:00Z"));
        assertThat(taskService.get(auth.user().id(), existing.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T09:30:00Z"));
    }

    @Test
    void strictScheduleInsertionRejectsOverlapAndAppliesOnlyTheSourceAtAnExactSlot() {
        AuthResult auth = register("sync-strict-placement");
        UUID userId = auth.user().id();
        UUID subjectId = subjectService.create(userId, new SubjectCommand(
                "Strict placement", null, null, "001")).id();
        var beforeWindow = taskService.create(userId, new TaskCommand(
                subjectId, "Before window", null, TaskStatus.TODO,
                Instant.parse("2099-10-06T07:45:00+08:00"), null, 30, "001"));
        var later = taskService.create(userId, new TaskCommand(
                subjectId, "Later", null, TaskStatus.TODO,
                Instant.parse("2099-10-06T09:30:00+08:00"), null, 30, "002"));
        var source = taskService.create(userId, new TaskCommand(
                subjectId, "Source", null, TaskStatus.TODO, null,
                Instant.parse("2099-10-06T09:00:00+08:00"), 30, "003"));
        long cursorBefore = changeLogService.latestCursor(userId).value();
        var payload = objectMapper.createObjectNode()
                .put("taskId", source.id().toString())
                .put("baseVersion", source.version())
                .put("scheduledAt", "2099-10-06T08:00:00+08:00")
                .put("windowStartAt", "2099-10-06T08:00:00+08:00")
                .put("windowLastStartAt", "2099-10-06T22:30:00+08:00")
                .put("placementMode", "STRICT");
        var overlap = new SyncMutation("strict-overlap", SyncResourceType.TASK, source.id(),
                SyncMutationType.SCHEDULE_INSERTION, source.version(), payload);

        var rejected = syncService.push(userId, auth.serverDeviceId(), List.of(overlap)).getFirst();

        assertThat(rejected.decision()).isEqualTo(MutationDecision.REJECTED);
        assertThat(rejected.code()).isEqualTo("VALIDATION_FAILED");
        assertThat((JsonNode) rejected.current()).hasSize(1);
        assertThat(((JsonNode) rejected.current()).get(0).path("id").asText()).isEqualTo(source.id().toString());
        assertThat(changeLogService.latestCursor(userId).value()).isEqualTo(cursorBefore);
        assertThat(taskService.get(userId, source.id())).extracting(TaskView::scheduledAt, TaskView::version)
                .containsExactly(null, source.version());

        var placement = new SyncMutation("strict-placement", SyncResourceType.TASK, source.id(),
                SyncMutationType.SCHEDULE_INSERTION, source.version(),
                payload.deepCopy().put("scheduledAt", "2099-10-06T08:30:00+08:00"));
        var applied = syncService.push(userId, auth.serverDeviceId(), List.of(placement)).getFirst();
        var replay = syncService.push(userId, auth.serverDeviceId(), List.of(placement)).getFirst();

        assertThat(applied.decision()).isEqualTo(MutationDecision.APPLIED);
        assertThat((JsonNode) applied.current()).hasSize(1);
        assertThat(((JsonNode) applied.current()).get(0).path("id").asText()).isEqualTo(source.id().toString());
        assertThat(replay.current()).isEqualTo(applied.current());
        assertThat(replay.changeCursor()).isEqualTo(applied.changeCursor());
        assertThat(changeLogService.latestCursor(userId).value()).isEqualTo(cursorBefore + 1);
        assertThat(taskService.get(userId, source.id()).scheduledAt())
                .isEqualTo(Instant.parse("2099-10-06T08:30:00+08:00"));
        assertThat(taskService.get(userId, source.id()).version()).isEqualTo(source.version() + 1);
        assertThat(taskService.get(userId, beforeWindow.id())).extracting(TaskView::scheduledAt, TaskView::version)
                .containsExactly(beforeWindow.scheduledAt(), beforeWindow.version());
        assertThat(taskService.get(userId, later.id())).extracting(TaskView::scheduledAt, TaskView::version)
                .containsExactly(later.scheduledAt(), later.version());

        var stale = new SyncMutation("strict-stale", SyncResourceType.TASK, source.id(),
                SyncMutationType.SCHEDULE_INSERTION, source.version(), placement.payload());
        var conflict = syncService.push(userId, auth.serverDeviceId(), List.of(stale)).getFirst();
        assertThat(conflict.decision()).isEqualTo(MutationDecision.CONFLICT);
        assertThat(conflict.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertThat((JsonNode) conflict.current()).hasSize(1);
        assertThat(((JsonNode) conflict.current()).get(0).path("version").asLong()).isEqualTo(source.version() + 1);
        assertThat(changeLogService.latestCursor(userId).value()).isEqualTo(cursorBefore + 1);
    }

    @Test
    void scheduleInsertionBusinessRejectionPersistsCurrentTasks() {
        AuthResult auth = register("sync-sched-reject");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule deadline", null, null, "001")).id();
        TaskView source = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Deadline source", null, TaskStatus.TODO, null,
                Instant.parse("2026-09-25T08:15:00Z"), 30, "001"));
        var payload = objectMapper.createObjectNode()
                .put("taskId", source.id().toString())
                .put("baseVersion", source.version())
                .put("scheduledAt", "2026-09-25T08:00:00Z")
                .put("windowStartAt", "2026-09-25T08:00:00Z")
                .put("windowLastStartAt", "2026-09-25T22:30:00Z");
        SyncMutation mutation = new SyncMutation("schedule-insertion-rejected-1", SyncResourceType.TASK,
                source.id(), SyncMutationType.SCHEDULE_INSERTION, source.version(), payload);

        var result = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();

        assertThat(result.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.REJECTED);
        assertThat(result.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(result.current()).isInstanceOf(tools.jackson.databind.JsonNode.class);
        assertThat((tools.jackson.databind.JsonNode) result.current()).hasSize(1);
        assertThat(taskService.get(auth.user().id(), source.id()).scheduledAt()).isNull();
    }

    @Test
    void scheduleInsertionRejectsPayloadIdentityOrVersionThatDiffersFromOuterMutation() {
        AuthResult auth = register("sched-ins-id");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule insertion identity", null, null, "001")).id();
        TaskView source = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Source", null, TaskStatus.TODO, null, null, 30, "001"));
        TaskView payloadTask = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Payload task", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T09:00:00Z"), null, 30, "002"));

        var mismatchedIdentityPayload = objectMapper.createObjectNode()
                .put("taskId", payloadTask.id().toString())
                .put("baseVersion", payloadTask.version())
                .put("scheduledAt", "2026-09-25T08:00:00Z")
                .put("windowStartAt", "2026-09-25T08:00:00Z")
                .put("windowLastStartAt", "2026-09-25T22:30:00Z");
        var mismatchedVersionPayload = objectMapper.createObjectNode()
                .put("taskId", source.id().toString())
                .put("baseVersion", source.version() + 1)
                .put("scheduledAt", "2026-09-25T08:00:00Z")
                .put("windowStartAt", "2026-09-25T08:00:00Z")
                .put("windowLastStartAt", "2026-09-25T22:30:00Z");

        var identityResult = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("schedule-insertion-wrong-task", SyncResourceType.TASK, source.id(),
                        SyncMutationType.SCHEDULE_INSERTION, source.version(), mismatchedIdentityPayload))).getFirst();
        var versionResult = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("schedule-insertion-wrong-version", SyncResourceType.TASK, source.id(),
                        SyncMutationType.SCHEDULE_INSERTION, source.version(), mismatchedVersionPayload))).getFirst();

        for (var result : java.util.List.of(identityResult, versionResult)) {
            assertThat(result.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.REJECTED);
            assertThat(result.code()).isEqualTo("VALIDATION_FAILED");
            var current = (tools.jackson.databind.JsonNode) result.current();
            assertThat(current).hasSize(1);
            assertThat(current.get(0).get("id").asText()).isEqualTo(source.id().toString());
        }
        assertThat(taskService.get(auth.user().id(), source.id()).scheduledAt()).isNull();
        assertThat(taskService.get(auth.user().id(), payloadTask.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T09:00:00Z"));
    }

    @Test
    void scheduleSwapRejectsPayloadIdentityOrVersionThatDiffersFromOuterMutation() {
        AuthResult auth = register("sched-swap-id");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule swap identity", null, null, "001")).id();
        TaskView source = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Source", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T08:00:00Z"), null, 30, "001"));
        TaskView target = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Target", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T09:00:00Z"), null, 30, "002"));
        TaskView payloadTask = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Payload task", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T10:00:00Z"), null, 30, "003"));

        var mismatchedIdentityPayload = objectMapper.createObjectNode()
                .put("sourceTaskId", payloadTask.id().toString())
                .put("sourceBaseVersion", payloadTask.version())
                .put("targetTaskId", target.id().toString())
                .put("targetBaseVersion", target.version());
        var mismatchedVersionPayload = objectMapper.createObjectNode()
                .put("sourceTaskId", source.id().toString())
                .put("sourceBaseVersion", source.version() + 1)
                .put("targetTaskId", target.id().toString())
                .put("targetBaseVersion", target.version());

        var identityResult = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("schedule-swap-wrong-task", SyncResourceType.TASK, source.id(),
                        SyncMutationType.SCHEDULE_SWAP, source.version(), mismatchedIdentityPayload))).getFirst();
        var versionResult = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("schedule-swap-wrong-version", SyncResourceType.TASK, source.id(),
                        SyncMutationType.SCHEDULE_SWAP, source.version(), mismatchedVersionPayload))).getFirst();

        for (var result : java.util.List.of(identityResult, versionResult)) {
            assertThat(result.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.REJECTED);
            assertThat(result.code()).isEqualTo("VALIDATION_FAILED");
            var current = (tools.jackson.databind.JsonNode) result.current();
            assertThat(current).extracting(item -> item.get("id").asText())
                    .contains(source.id().toString());
            assertThat(current).extracting(item -> item.get("id").asText())
                    .doesNotContain(payloadTask.id().toString());
        }
        assertThat(taskService.get(auth.user().id(), source.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T08:00:00Z"));
        assertThat(taskService.get(auth.user().id(), target.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T09:00:00Z"));
        assertThat(taskService.get(auth.user().id(), payloadTask.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T10:00:00Z"));
    }

    @Test
    void scheduleSwapRejectsMissingTargetBaseVersionAndReplaysDecision() {
        AuthResult auth = register("sched-swap-target-version");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule swap missing target version", null, null, "001")).id();
        TaskView source = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Source", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T08:00:00Z"), null, 30, "001"));
        TaskView target = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Target", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T09:00:00Z"), null, 30, "002"));
        var payload = objectMapper.createObjectNode()
                .put("sourceTaskId", source.id().toString())
                .put("sourceBaseVersion", source.version())
                .put("targetTaskId", target.id().toString());
        SyncMutation mutation = new SyncMutation("schedule-swap-missing-target-version-1", SyncResourceType.TASK,
                source.id(), SyncMutationType.SCHEDULE_SWAP, source.version(), payload);

        var first = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();
        var replay = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();

        assertThat(first.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.REJECTED);
        assertThat(first.code()).isEqualTo("VALIDATION_FAILED");
        assertThat(first.current()).isInstanceOf(tools.jackson.databind.JsonNode.class);
        var current = (tools.jackson.databind.JsonNode) first.current();
        assertThat(current).hasSize(2);
        assertThat(current).extracting(item -> item.get("id").asText())
                .contains(source.id().toString(), target.id().toString());
        assertThat(replay.decision()).isEqualTo(first.decision());
        assertThat(replay.code()).isEqualTo(first.code());
        assertThat(replay.recordedAt()).isEqualTo(first.recordedAt());
        assertThat(taskService.get(auth.user().id(), source.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T08:00:00Z"));
        assertThat(taskService.get(auth.user().id(), target.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T09:00:00Z"));
    }

    @Test
    void scheduleSwapVersionConflictStoresBothCurrentTasksWithoutPartialMove() {
        AuthResult auth = register("sync-schedule-swap-conflict");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Schedule swap", null, null, "001")).id();
        TaskView source = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Source", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T08:00:00Z"), null, 30, "001"));
        TaskView target = taskService.create(auth.user().id(), new TaskCommand(
                subjectId, "Target", null, TaskStatus.TODO,
                Instant.parse("2026-09-25T09:00:00Z"), null, 30, "002"));
        var payload = objectMapper.createObjectNode()
                .put("sourceTaskId", source.id().toString())
                .put("sourceBaseVersion", 1)
                .put("targetTaskId", target.id().toString())
                .put("targetBaseVersion", target.version());
        SyncMutation mutation = new SyncMutation("schedule-swap-conflict-1", SyncResourceType.TASK,
                source.id(), SyncMutationType.SCHEDULE_SWAP, 1, payload);

        var result = syncService.push(auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst();

        assertThat(result.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.CONFLICT);
        assertThat(result.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertThat(result.current()).isInstanceOf(tools.jackson.databind.JsonNode.class);
        assertThat((tools.jackson.databind.JsonNode) result.current()).hasSize(2);
        assertThat(taskService.get(auth.user().id(), source.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T08:00:00Z"));
        assertThat(taskService.get(auth.user().id(), target.id()).scheduledAt())
                .isEqualTo(Instant.parse("2026-09-25T09:00:00Z"));
    }

    @Test
    void concurrentReplayOfOneMutationAppliesTheDomainWriteOnce() throws Exception {
        AuthResult auth = register("sync-concurrent-push");
        UUID resourceId = UUID.randomUUID();
        var payload = objectMapper.createObjectNode()
                .put("name", "Concurrent subject")
                .put("sortKey", "001");
        SyncMutation mutation = new SyncMutation("concurrent-id", SyncResourceType.SUBJECT, resourceId,
                SyncMutationType.CREATE, 0, payload);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> syncService.push(
                    auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst());
            var second = executor.submit(() -> syncService.push(
                    auth.user().id(), auth.serverDeviceId(), java.util.List.of(mutation)).getFirst());

            var firstResult = first.get();
            var secondResult = second.get();
            assertThat(firstResult.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
            assertThat(secondResult.decision()).isEqualTo(firstResult.decision());
            assertThat(secondResult.changeCursor()).isEqualTo(firstResult.changeCursor());
            assertThat(changeLogService.latestCursor(auth.user().id()).value()).isEqualTo(1L);
            assertThat(subjectService.get(auth.user().id(), resourceId).name()).isEqualTo("Concurrent subject");
        }
    }

    @Test
    void cursorHighWaterMarkSurvivesRetentionCleanup() {
        UUID userId = insertUser("sync-retention-" + UUID.randomUUID());
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("before"));
        jdbcTemplate.update("update change_log set created_at = ? where user_id = ?",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), userId);

        syncRetentionService.purgeExpired();
        var afterCleanup = changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("after"));

        assertThat(afterCleanup.cursor()).isEqualTo(2L);
    }

    @Test
    void pullWithoutCursorDoesNotResetForEmptyOwnerOrCompleteOwnerHistory() {
        UUID otherUserId = insertUser("sync-initial-cursor-other-" + UUID.randomUUID());
        changeLogService.record(otherUserId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("other-owner-first"));
        UUID userId = insertUser("sync-initial-cursor-owner-" + UUID.randomUUID());
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("owner-first"));

        ChangeLogPage page = syncService.pull(userId, null, 10);
        UUID emptyUserId = insertUser("sync-initial-cursor-empty-" + UUID.randomUUID());
        ChangeLogPage emptyPage = syncService.pull(emptyUserId, null, 10);

        assertThat(changeLogService.latestCursor(userId).value()).isEqualTo(1L);
        assertThat(page.resetRequired()).isFalse();
        assertThat(page.changes()).hasSize(1);
        assertThat(page.changes().getFirst().cursor()).isEqualTo(1L);
        assertThat(emptyPage.resetRequired()).isFalse();
        assertThat(emptyPage.changes()).isEmpty();
    }

    @Test
    void pullWithoutCursorRequiresSnapshotWhenRetentionRemovedPartOfOwnerHistory() {
        AuthResult auth = register("sync-reset-initial-cursor");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "Expired subject", null, null, "001")).id();
        subjectService.delete(auth.user().id(), subjectId, 0);
        jdbcTemplate.update("update change_log set created_at = ? where user_id = ? and cursor = 1",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), auth.user().id());
        syncRetentionService.purgeExpired();

        ChangeLogPage page = syncService.pull(auth.user().id(), null, 10);
        var snapshot = syncService.snapshot(auth.user().id());

        assertThat(page.resetRequired()).isTrue();
        assertThat(page.changes()).isEmpty();
        assertThat(snapshot.snapshotCursor()).isEqualTo(changeLogService.latestCursor(auth.user().id()).encode());
        assertThat(snapshot.subjects()).anySatisfy(subject -> {
            var view = (com.auralis.app.subject.SubjectView) subject;
            assertThat(view.id()).isEqualTo(subjectId);
            assertThat(view.deletedAt()).isNotNull();
        });
    }

    @Test
    void pullWithoutCursorRequiresSnapshotWhenAllOwnerHistoryWasPurged() {
        UUID userId = insertUser("sync-purged-" + UUID.randomUUID());
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("expired"));
        jdbcTemplate.update("update change_log set created_at = ? where user_id = ?",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), userId);
        syncRetentionService.purgeExpired();

        ChangeLogPage page = syncService.pull(userId, null, 10);

        assertThat(changeLogService.latestCursor(userId).value()).isEqualTo(1L);
        assertThat(page.resetRequired()).isTrue();
        assertThat(page.changes()).isEmpty();
    }

    @Test
    void expiredCursorRequiresResetAfterRetentionGap() {
        UUID userId = insertUser("sync-reset-" + UUID.randomUUID());
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("old-1"));
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("old-2"));
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("retained"));
        jdbcTemplate.update("update change_log set created_at = ? where user_id = ? and cursor < 3",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), userId);

        syncRetentionService.purgeExpired();

        ChangeLogPage page = changeLogService.pull(userId, new SyncCursor(1), 10);
        assertThat(page.resetRequired()).isTrue();
        assertThat(page.changes()).isEmpty();
    }

    @Test
    void retentionCleanupPublishesPurgedRowsMetric() {
        UUID userId = insertUser("sync-metric-" + UUID.randomUUID());
        changeLogService.record(userId, SyncResourceType.TASK, UUID.randomUUID(),
                SyncMutationType.CREATE, 0, null, new Payload("old"));
        jdbcTemplate.update("update change_log set created_at = ? where user_id = ?",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), userId);

        double before = meterRegistry.get("auralis.sync.retention.purged").counter().count();
        syncRetentionService.purgeExpired();

        assertThat(meterRegistry.get("auralis.sync.retention.purged").counter().count())
                .isGreaterThan(before);
    }

    @Test
    void scheduledRetentionCleanupRunsDeleteQueriesInsideTransaction() {
        AuthResult auth = register("sync-scheduled-retention");
        UUID userId = auth.user().id();
        UUID resourceId = UUID.randomUUID();
        var payload = objectMapper.createObjectNode()
                .put("name", "Expired sync subject")
                .put("sortKey", "001");
        syncService.push(userId, auth.serverDeviceId(), java.util.List.of(
                new SyncMutation("expired-mutation", SyncResourceType.SUBJECT, resourceId,
                        SyncMutationType.CREATE, 0, payload)));
        jdbcTemplate.update("update change_log set created_at = ? where user_id = ?",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), userId);
        jdbcTemplate.update("update inbound_mutations set created_at = ? where user_id = ?",
                java.time.Instant.parse("2020-01-01T00:00:00Z"), userId);

        syncRetentionService.scheduledPurgeExpired();

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from change_log where user_id = ?", Long.class, userId))
                .isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from inbound_mutations where user_id = ?", Long.class, userId))
                .isZero();
    }

    @Test
    void snapshotContainsDeletedResourceTombstones() {
        AuthResult auth = register("sync-snapshot");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "To delete", null, null, "001")).id();
        subjectService.delete(auth.user().id(), subjectId, 0);

        var snapshot = syncService.snapshot(auth.user().id());

        assertThat(snapshot.subjects()).anySatisfy(subject -> {
            var view = (com.auralis.app.subject.SubjectView) subject;
            assertThat(view.id()).isEqualTo(subjectId);
            assertThat(view.deletedAt()).isNotNull();
        });
    }

    private AuthResult register(String prefix) {
        return AuthTestAccounts.register(identityService, prefix + "-" + UUID.randomUUID(), "phase-three-password",
                new DeviceCommand("device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB));
    }

    private UUID insertUser(String username) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users(id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                id, username, username, "{noop}phase-three-test");
        return id;
    }

    private record Payload(String value) {
    }
}
