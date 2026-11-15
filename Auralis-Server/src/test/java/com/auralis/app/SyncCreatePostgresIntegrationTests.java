package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.sync.MutationDecision;
import com.auralis.app.sync.SyncDtos.MutationResponse;
import com.auralis.app.sync.SyncMutation;
import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import com.auralis.app.sync.SyncService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class SyncCreatePostgresIntegrationTests {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:0.8.6-pg17-bookworm").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SyncService syncService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;

    @ParameterizedTest
    @EnumSource(SyncResourceType.class)
    void createPreservesExistingOwnerAndDataAndRejectsOnlyTheCollidingMutation(SyncResourceType type) {
        Owner owner = register();
        Owner other = register();
        UUID resourceId = UUID.randomUUID();
        SyncMutation original = create(owner, type, resourceId, "original");
        MutationResponse applied = push(owner, original).getFirst();
        assertThat(applied.decision()).isEqualTo(MutationDecision.APPLIED);
        assertThat(applied.changeCursor()).isNotNull();
        assertThat(push(owner, original)).containsExactly(applied);

        String table = switch (type) {
            case SUBJECT -> "subjects";
            case KNOWLEDGE_BLOCK -> "knowledge_blocks";
            case TASK -> "tasks";
            case SOURCE -> "sources";
            case RELATION -> "relations";
        };
        var row = jdbcTemplate.queryForMap("select * from " + table + " where id = ?", resourceId);
        assertThat(row).containsEntry("user_id", owner.auth().user().id()).containsEntry("version", 0L);
        var jobs = jdbcTemplate.queryForList("select * from ingestion_jobs where source_id = ?", resourceId);
        if (type == SyncResourceType.SOURCE) {
            assertThat(jobs).singleElement().satisfies(job -> assertThat(job)
                    .containsEntry("user_id", owner.auth().user().id())
                    .containsEntry("ingestion_revision", row.get("ingestion_revision")));
        }

        SyncMutation sameOwner = create(owner, type, resourceId, "replacement");
        SyncMutation following = create(owner, SyncResourceType.SUBJECT, UUID.randomUUID(), "following");
        var batch = push(owner, sameOwner, following);
        assertRejected(batch.getFirst());
        assertThat(batch.get(1).decision()).isEqualTo(MutationDecision.APPLIED);
        assertThat(push(owner, sameOwner)).containsExactly(batch.getFirst());

        SyncMutation otherOwner = create(other, type, resourceId, "other owner replacement");
        MutationResponse rejected = push(other, otherOwner).getFirst();
        assertRejected(rejected);
        assertThat(push(other, otherOwner)).containsExactly(rejected);
        assertThat(jdbcTemplate.queryForMap("select * from " + table + " where id = ?", resourceId))
                .isEqualTo(row);
        assertThat(jdbcTemplate.queryForList("select * from ingestion_jobs where source_id = ?", resourceId))
                .isEqualTo(jobs);
        assertThat(changeCount(type, resourceId)).isEqualTo(1);
    }

    @Test
    void rejectsCreateOverNewerAndSoftDeletedSubjectButReplaysOriginalReceipt() {
        Owner owner = register();
        UUID id = UUID.randomUUID();
        SyncMutation original = create(owner, SyncResourceType.SUBJECT, id, "original");
        MutationResponse applied = push(owner, original).getFirst();
        var updated = subjectService.update(owner.auth().user().id(), id, 0,
                new SubjectCommand("updated", null, null, "1"));
        var updatedRow = jdbcTemplate.queryForMap("select * from subjects where id = ?", id);
        assertThat(updatedRow).containsEntry("version", 1L);

        assertRejected(push(owner, create(owner, SyncResourceType.SUBJECT, id, "replacement")).getFirst());
        assertThat(jdbcTemplate.queryForMap("select * from subjects where id = ?", id)).isEqualTo(updatedRow);

        subjectService.delete(owner.auth().user().id(), id, updated.version());
        var tombstone = jdbcTemplate.queryForMap("select * from subjects where id = ?", id);
        assertThat(tombstone.get("deleted_at")).isNotNull();
        assertRejected(push(owner, create(owner, SyncResourceType.SUBJECT, id, "recreated")).getFirst());
        assertThat(jdbcTemplate.queryForMap("select * from subjects where id = ?", id)).isEqualTo(tombstone);
        assertThat(push(owner, original)).containsExactly(applied);
        assertThat(changeCount(SyncResourceType.SUBJECT, id)).isEqualTo(3);
    }

    @Test
    void concurrentCreatesOfTheSameUuidCommitOneOwnerAndOneChange() throws Exception {
        Owner first = register();
        Owner second = register();
        UUID id = UUID.randomUUID();
        SyncMutation firstCreate = create(first, SyncResourceType.SUBJECT, id, "first owner");
        SyncMutation secondCreate = create(second, SyncResourceType.SUBJECT, id, "second owner");
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var firstFuture = executor.submit(() -> pushWhenReady(first, firstCreate, ready, start));
            var secondFuture = executor.submit(() -> pushWhenReady(second, secondCreate, ready, start));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            MutationResponse firstResponse = firstFuture.get(15, TimeUnit.SECONDS);
            MutationResponse secondResponse = secondFuture.get(15, TimeUnit.SECONDS);
            assertThat(List.of(firstResponse.decision(), secondResponse.decision()))
                    .containsExactlyInAnyOrder(MutationDecision.APPLIED, MutationDecision.REJECTED);
            boolean firstWon = firstResponse.decision() == MutationDecision.APPLIED;
            assertRejected(firstWon ? secondResponse : firstResponse);
            assertThat(jdbcTemplate.queryForMap("select user_id, name, version from subjects where id = ?", id))
                    .containsEntry("user_id", (firstWon ? first : second).auth().user().id())
                    .containsEntry("name", firstWon ? "first owner" : "second owner")
                    .containsEntry("version", 0L);
            assertThat(changeCount(SyncResourceType.SUBJECT, id)).isEqualTo(1);
            assertThat(push(first, firstCreate)).containsExactly(firstResponse);
            assertThat(push(second, secondCreate)).containsExactly(secondResponse);
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    private SyncMutation create(Owner owner, SyncResourceType type, UUID id, String label) {
        var payload = switch (type) {
            case SUBJECT -> objectMapper.createObjectNode().put("name", label);
            case KNOWLEDGE_BLOCK -> objectMapper.createObjectNode().put("subjectId", owner.subject().toString())
                    .put("title", label).put("content", label);
            case TASK -> objectMapper.createObjectNode().put("subjectId", owner.subject().toString())
                    .put("title", label).put("status", "TODO").put("durationMinutes", 30)
                    .put("scheduledAt", label.equals("original") ? "2026-09-25T08:00:00Z" : "2026-09-25T10:00:00Z");
            case SOURCE -> objectMapper.createObjectNode().put("subjectId", owner.subject().toString())
                    .put("type", "TEXT").put("title", label).put("rawText", label);
            case RELATION -> objectMapper.createObjectNode().put("sourceType", "SUBJECT")
                    .put("sourceId", owner.subject().toString()).put("targetType", "SUBJECT")
                    .put("targetId", owner.target().toString()).put("label", label)
                    .put("type", label.equals("original") ? "REFERENCES" : "DEPENDS_ON");
        };
        return new SyncMutation(UUID.randomUUID().toString(), type, id, SyncMutationType.CREATE, 0, payload);
    }

    private Owner register() {
        AuthResult auth = AuthTestAccounts.register(identityService, "sync-create-" + UUID.randomUUID(), "sync-create-password", new DeviceCommand("sync-create", "Test Device", DevicePlatform.WEB));
        UUID userId = auth.user().id();
        return new Owner(auth,
                subjectService.create(userId, new SubjectCommand("First subject", null, null, "1")).id(),
                subjectService.create(userId, new SubjectCommand("Second subject", null, null, "2")).id());
    }

    private MutationResponse pushWhenReady(Owner owner, SyncMutation mutation, CountDownLatch ready,
                                           CountDownLatch start) throws InterruptedException {
        ready.countDown();
        assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
        return push(owner, mutation).getFirst();
    }

    private List<MutationResponse> push(Owner owner, SyncMutation... mutations) {
        return syncService.push(owner.auth().user().id(), owner.auth().serverDeviceId(), List.of(mutations));
    }

    private long changeCount(SyncResourceType type, UUID id) {
        return jdbcTemplate.queryForObject("select count(*) from change_log where resource_type = ? and resource_id = ?",
                Long.class, type.name(), id);
    }

    private void assertRejected(MutationResponse result) {
        assertThat(result.decision()).isEqualTo(MutationDecision.REJECTED);
        assertThat(result.code()).isEqualTo("MUTATION_REJECTED");
        assertThat(result.changeCursor()).isNull();
        assertThat(result.current()).isNull();
    }

    private record Owner(AuthResult auth, UUID subject, UUID target) {
    }
}
