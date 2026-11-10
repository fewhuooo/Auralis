package com.auralis.app.ai.usage;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockContentHash;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.review.ReviewLifecycleDtos;
import com.auralis.app.review.ReviewLifecycleRating;
import com.auralis.app.review.ReviewLifecycleService;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
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

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** Disposable real PostgreSQL evidence; no business database or Provider use. */
@SpringBootTest(classes = AuralisApplication.class, properties = {
        "auralis.ai.limits.global-concurrent=4", "auralis.ai.limits.per-user-concurrent=2"})
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class PcAcceptancePostgresIntegrationTests {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:0.8.6-pg17-bookworm")
                    .asCompatibleSubstituteFor("postgres"));
    static { POSTGRES.withTmpFs(Map.of("/var/lib/postgresql/data", "rw")); }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired IdentityService identity;
    @Autowired SubjectService subjects;
    @Autowired KnowledgeBlockService blocks;
    @Autowired ReviewLifecycleService review;
    @Autowired AiUsageGuard guard;

    @BeforeEach
    void databaseIsDisposable() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getURL()).isEqualTo(POSTGRES.getJdbcUrl());
        }
        assertThat(POSTGRES.getMappedPort(5432)).isNotEqualTo(5432);
    }

    @Test
    void everyFrozenReviewStateMatchesHistoryFromIndependentTransactionsAndReplayStaysExact() {
        UUID user = user();
        UUID subject = subjects.create(user, new SubjectCommand("Review precision", null, null, "001")).id();
        var block = blocks.create(user, new KnowledgeBlockCommand(subject, null, "Precision", "body", null));
        String hash = KnowledgeBlockContentHash.sha256(block.content());
        var firstRequest = new ReviewLifecycleDtos.LearningCompletionRequest(UUID.randomUUID(), block.id(),
                block.version(), 0L, hash, null, null, true);
        var first = review.completeLearning(user, firstRequest);
        assertState(user, block.id(), first);
        String frozen = jdbc.queryForObject("select response_payload from review_lifecycle_commands "
                + "where user_id=? and client_command_id=?", String.class, user, firstRequest.clientCommandId());
        assertThat(review.completeLearning(user, firstRequest)).isEqualTo(first);

        UUID reviewId = UUID.randomUUID();
        var selected = review.startAttempt(user, new ReviewLifecycleDtos.ReviewAttemptRequest(UUID.randomUUID(),
                block.id(), block.version(), first.state().version(), hash, reviewId,
                ReviewLifecycleRating.GOOD, 10, null, false));
        assertState(user, block.id(), selected);
        var confirmed = review.confirm(user, reviewId, new ReviewLifecycleDtos.ReviewResolutionRequest(
                UUID.randomUUID(), block.id(), block.version(), selected.state().version(), hash, null, false));
        assertState(user, block.id(), confirmed);
        var corrected = review.correctAgain(user, reviewId, new ReviewLifecycleDtos.ReviewResolutionRequest(
                UUID.randomUUID(), block.id(), block.version(), confirmed.state().version(), hash, null, false));
        assertState(user, block.id(), corrected);
        var learnedAgain = review.completeLearning(user, new ReviewLifecycleDtos.LearningCompletionRequest(
                UUID.randomUUID(), block.id(), block.version(), corrected.state().version(), hash, reviewId, null, false));
        assertState(user, block.id(), learnedAgain);
        var reopened = review.reopenLearning(user, new ReviewLifecycleDtos.LearningReopenRequest(
                UUID.randomUUID(), block.id(), block.version(), learnedAgain.state().version(), hash, null, null, false));
        assertState(user, block.id(), reopened);
        assertThat(review.completeLearning(user, firstRequest)).isEqualTo(first);
        assertThat(jdbc.queryForObject("select response_payload from review_lifecycle_commands "
                + "where user_id=? and client_command_id=?", String.class, user, firstRequest.clientCommandId()))
                .isEqualTo(frozen);
    }

    private void assertState(UUID user, UUID block, ReviewLifecycleDtos.CommandResponse receipt) {
        // The test has no outer transaction, so history cannot reuse the write's persistence context.
        assertThat(review.history(user, block).state()).isEqualTo(receipt.state());
        assertThat(receipt.state().createdAt().getNano() % 1_000).isZero();
        assertThat(receipt.state().updatedAt().getNano() % 1_000).isZero();
    }

    @Test
    void parallelOverviewAdmissionsReserveOnlyOneSlotAndChatCanUseTheOther() throws Exception {
        UUID user = user();
        var first = guard.beginTask(new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "parallel-source"));
        var second = guard.beginTask(new AiTaskContext(user, AiFeature.SUBJECT_OVERVIEW, "parallel-subject"));
        var chat = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "parallel-chat"));
        CyclicBarrier barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> a;
            Future<Boolean> b;
            try (Connection gate = dataSource.getConnection()) {
                gate.setAutoCommit(false);
                int gatePid;
                try (var statement = gate.createStatement(); var result = statement.executeQuery("select pg_backend_pid()")) {
                    result.next();
                    gatePid = result.getInt(1);
                }
                try (var statement = gate.prepareStatement("select id from users where id=? for update")) {
                    statement.setObject(1, user);
                    statement.executeQuery().close();
                }
                a = executor.submit(() -> raceReserve(first, barrier));
                b = executor.submit(() -> raceReserve(second, barrier));
                try {
                    long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                    int blocked;
                    do {
                        blocked = jdbc.queryForObject("with recursive blocked(pid) as ("
                                + "select pid from pg_stat_activity where ?=any(pg_blocking_pids(pid)) union "
                                + "select a.pid from pg_stat_activity a join blocked b "
                                + "on b.pid=any(pg_blocking_pids(a.pid))) select count(distinct pid) from blocked",
                                Integer.class, gatePid);
                        if (blocked < 2) Thread.sleep(20);
                    } while (blocked < 2 && System.nanoTime() < until);
                    assertThat(blocked).isEqualTo(2);
                } finally {
                    gate.rollback();
                }
            }
            assertThat((a.get(5, TimeUnit.SECONDS) ? 1 : 0) + (b.get(5, TimeUnit.SECONDS) ? 1 : 0)).isEqualTo(1);
            guard.reserve(chat, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "test-model",
                    AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 10);
            assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? "
                    + "and state='RESERVED'", Integer.class, user)).isEqualTo(2);
        }
    }

    private boolean raceReserve(AiUsageGuard.TaskLease task, CyclicBarrier barrier) throws Exception {
        barrier.await(5, TimeUnit.SECONDS);
        try {
            guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "test-model",
                    AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 10, 10);
            return true;
        } catch (AiUsageLimitException busy) {
            assertThat(busy.code()).isEqualTo("AI_CONCURRENCY_LIMIT");
            return false;
        }
    }

    private UUID user() {
        return identity.register("pc-acceptance-" + UUID.randomUUID() + "@example.test",
                "Test-only-password-2026!", "PC acceptance",
                new DeviceCommand("pc-acceptance-" + UUID.randomUUID(), "PC acceptance", DevicePlatform.WEB))
                .user().id();
    }
}
