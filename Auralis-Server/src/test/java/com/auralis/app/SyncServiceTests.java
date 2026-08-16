package com.auralis.app;

import com.auralis.app.sync.ChangeLogPage;
import com.auralis.app.sync.ChangeLogService;
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
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
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
    private SyncService syncService;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

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
                .putNull("color")
                .put("sortKey", "001");
        SyncMutation mutation = new SyncMutation("client-1", SyncResourceType.SUBJECT, resourceId,
                SyncMutationType.CREATE, 0, payload);

        var first = syncService.push(auth.user().id(), auth.deviceId(), java.util.List.of(mutation)).getFirst();
        var replay = syncService.push(auth.user().id(), auth.deviceId(), java.util.List.of(mutation)).getFirst();
        subjectService.update(auth.user().id(), resourceId, 0,
                new SubjectCommand("Physics Updated", null, null, null, "001"));
        var conflict = syncService.push(auth.user().id(), auth.deviceId(), java.util.List.of(
                new SyncMutation("client-2", SyncResourceType.SUBJECT, resourceId,
                        SyncMutationType.UPDATE, 0, payload))).getFirst();

        assertThat(first.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.APPLIED);
        assertThat(replay.decision()).isEqualTo(first.decision());
        assertThat(replay.recordedAt()).isEqualTo(first.recordedAt());
        assertThat(conflict.decision()).isEqualTo(com.auralis.app.sync.MutationDecision.CONFLICT);
        assertThat(changeLogService.latestCursor(auth.user().id()).value()).isEqualTo(2);
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
        syncService.push(auth.user().id(), auth.deviceId(), java.util.List.of(original));

        var results = syncService.push(auth.user().id(), auth.deviceId(), java.util.List.of(
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
                    auth.user().id(), auth.deviceId(), java.util.List.of(mutation)).getFirst());
            var second = executor.submit(() -> syncService.push(
                    auth.user().id(), auth.deviceId(), java.util.List.of(mutation)).getFirst());

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
    void snapshotContainsDeletedResourceTombstones() {
        AuthResult auth = register("sync-snapshot");
        UUID subjectId = subjectService.create(auth.user().id(), new SubjectCommand(
                "To delete", null, null, null, "001")).id();
        subjectService.delete(auth.user().id(), subjectId, 0);

        var snapshot = syncService.snapshot(auth.user().id());

        assertThat(snapshot.subjects()).anySatisfy(subject -> {
            var view = (com.auralis.app.subject.SubjectView) subject;
            assertThat(view.id()).isEqualTo(subjectId);
            assertThat(view.deletedAt()).isNotNull();
        });
    }

    private AuthResult register(String prefix) {
        return identityService.register(prefix + "-" + UUID.randomUUID(), "phase-three-password", "Sync Test",
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
