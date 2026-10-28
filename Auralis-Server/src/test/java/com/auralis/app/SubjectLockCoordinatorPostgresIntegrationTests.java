package com.auralis.app;

import com.auralis.app.subject.SubjectLockCoordinator;
import com.auralis.app.knowledge.KnowledgeBlockContentHash;
import com.auralis.app.review.ReviewLifecycleDtos;
import com.auralis.app.review.ReviewLifecycleService;
import com.auralis.app.review.internal.persistence.ReviewParameterSetEntity;
import com.auralis.app.review.internal.persistence.ReviewParameterSetRepository;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

/**
 * PostgreSQL/Hibernate evidence for the Subject-first canonical lock protocol.
 * This is opt-in because it requires Docker and a real row-locking database.
 */
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class SubjectLockCoordinatorPostgresIntegrationTests {

    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private ReviewLifecycleService reviewLifecycleService;
    @MockitoSpyBean private ReviewParameterSetRepository reviewParameterSetRepository;
    @MockitoSpyBean private SubjectLockCoordinator coordinator;

    @Test
    void oppositeRequestDirectionsSerializeAfterCanonicalSubjectRowLocks() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID firstSubjectId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID secondSubjectId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        insertUser(userId);
        insertSubject(userId, firstSubjectId, "First");
        insertSubject(userId, secondSubjectId, "Second");

        CountDownLatch secondLockAttempted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() == 2) {
                secondLockAttempted.countDown();
            }
            return invocation.callRealMethod();
        }).when(coordinator).lockSubjects(eq(userId), anyList());

        TransactionTemplate template = new TransactionTemplate(transactionManager);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> template.executeWithoutResult(status -> {
                coordinator.lockSubjects(userId, List.of(secondSubjectId, firstSubjectId));
                await(releaseFirst);
            }));
            Future<?> second = executor.submit(() -> template.executeWithoutResult(status ->
                    coordinator.lockSubjects(userId, List.of(firstSubjectId, secondSubjectId))));

            assertThat(secondLockAttempted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.isDone()).as("opposite direction must wait on canonical first Subject").isFalse();
            releaseFirst.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentFirstLearningCompletionsSerializeOnPostgresAfterV29Migration() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        String content = "PostgreSQL lifecycle lock body";
        String contentHash = KnowledgeBlockContentHash.sha256(content);
        insertUser(userId);
        insertSubject(userId, subjectId, "Lifecycle first learning subject");
        jdbcTemplate.update("insert into knowledge_blocks (id, user_id, subject_id, title, content) "
                        + "values (?, ?, ?, ?, ?)",
                blockId, userId, subjectId, "Lifecycle first learning block", content);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from review_states where user_id = ? and knowledge_block_id = ?",
                Long.class, userId, blockId)).isZero();

        CountDownLatch firstCompletedAndHoldsParentLock = new CountDownLatch(1);
        CountDownLatch secondWillAttempt = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        AtomicReference<Integer> firstBackendPid = new AtomicReference<>();
        AtomicReference<Integer> secondBackendPid = new AtomicReference<>();
        AtomicReference<String> secondDomainCode = new AtomicReference<>();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            TransactionTemplate template = new TransactionTemplate(transactionManager);
            Future<ReviewLifecycleDtos.CommandResponse> first = executor.submit(() -> template.execute(status -> {
                ReviewLifecycleDtos.CommandResponse response = reviewLifecycleService.completeLearning(userId,
                        new ReviewLifecycleDtos.LearningCompletionRequest(UUID.randomUUID(), blockId,
                                0L, 0L, contentHash, null, null, null));
                firstBackendPid.set(jdbcTemplate.queryForObject("select pg_backend_pid()", Integer.class));
                firstCompletedAndHoldsParentLock.countDown();
                await(releaseFirst);
                return response;
            }));

            assertThat(firstCompletedAndHoldsParentLock.await(5, TimeUnit.SECONDS)).isTrue();
            Future<String> second = executor.submit(() -> {
                try {
                    template.execute(status -> {
                        secondBackendPid.set(jdbcTemplate.queryForObject("select pg_backend_pid()", Integer.class));
                        secondWillAttempt.countDown();
                        try {
                            reviewLifecycleService.completeLearning(userId,
                                    new ReviewLifecycleDtos.LearningCompletionRequest(UUID.randomUUID(), blockId,
                                            0L, 0L, contentHash, null, null, null));
                        } catch (DomainException exception) {
                            secondDomainCode.set(exception.code());
                            throw exception;
                        }
                        return null;
                    });
                    return "ACCEPTED";
                } catch (RuntimeException exception) {
                    if (secondDomainCode.get() != null) return secondDomainCode.get();
                    throw exception;
                }
            });

            assertThat(secondWillAttempt.await(5, TimeUnit.SECONDS)).isTrue();
            awaitPostgresLockWait(firstBackendPid.get(), secondBackendPid.get(), second);
            assertThat(second.isDone()).as("second first-learning command must wait for the KB parent lock").isFalse();
            releaseFirst.countDown();
            ReviewLifecycleDtos.CommandResponse response = first.get(5, TimeUnit.SECONDS);
            assertThat(response.action()).isEqualTo("LEARNING_COMPLETED");
            assertThat(response.state()).isNotNull();
            assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo("MUTATION_REJECTED");
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_states where user_id = ? and knowledge_block_id = ?",
                    Long.class, userId, blockId)).isEqualTo(1L);
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_lifecycle_commands where user_id = ? and knowledge_block_id = ? "
                            + "and action = 'LEARNING_COMPLETED'",
                    Long.class, userId, blockId)).isEqualTo(1L);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS))
                    .as("PostgreSQL lifecycle lock workers must terminate")
                    .isTrue();
        }
    }

    @Test
    void lifecycleRejectsKnowledgeBlockMovedAfterInitialSubjectRead() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID oldSubjectId = UUID.randomUUID();
        UUID newSubjectId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        String content = "Lifecycle move-race content";
        String contentHash = KnowledgeBlockContentHash.sha256(content);
        insertUser(userId);
        insertSubject(userId, oldSubjectId, "Move-race old subject");
        insertSubject(userId, newSubjectId, "Move-race new subject");
        jdbcTemplate.update("insert into knowledge_blocks (id, user_id, subject_id, title, content) "
                        + "values (?, ?, ?, ?, ?)",
                blockId, userId, oldSubjectId, "Move-race block", content);

        AtomicBoolean movedAfterSubjectRead = new AtomicBoolean();
        ExecutorService mover = Executors.newSingleThreadExecutor();
        TransactionTemplate moveTransaction = new TransactionTemplate(transactionManager);
        try {
            doAnswer(invocation -> {
                if (movedAfterSubjectRead.compareAndSet(false, true)) {
                    Future<?> move = mover.submit(() -> moveTransaction.executeWithoutResult(status -> {
                        int updated = jdbcTemplate.update(
                                "update knowledge_blocks set subject_id = ?, version = version + 1 "
                                        + "where id = ? and user_id = ?",
                                newSubjectId, blockId, userId);
                        assertThat(updated).isEqualTo(1);
                    }));
                    move.get(5, TimeUnit.SECONDS);
                }
                return invocation.callRealMethod();
            }).when(coordinator).lockSubjects(eq(userId), anyList());

            DomainException failure = null;
            try {
                // Version 1 represents a caller that already knows the move's next version.
                reviewLifecycleService.completeLearning(userId,
                        new ReviewLifecycleDtos.LearningCompletionRequest(UUID.randomUUID(), blockId,
                                1L, 0L, contentHash, null, null, null));
            } catch (DomainException exception) {
                failure = exception;
            }

            assertThat(movedAfterSubjectRead).isTrue();
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_states where user_id = ? and knowledge_block_id = ?",
                    Long.class, userId, blockId)).isZero();
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_lifecycle_commands where user_id = ? and knowledge_block_id = ?",
                    Long.class, userId, blockId)).isZero();
            assertThat(failure).isNotNull();
            assertThat(failure.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
        } finally {
            mover.shutdownNow();
            assertThat(mover.awaitTermination(5, TimeUnit.SECONDS))
                    .as("KnowledgeBlock move worker must terminate")
                    .isTrue();
        }
    }

    @Test
    void independentFirstLearningCommandsSharePreseededParameterSetOnPostgres() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID firstSubjectId = UUID.randomUUID();
        UUID secondSubjectId = UUID.randomUUID();
        UUID firstBlockId = UUID.randomUUID();
        UUID secondBlockId = UUID.randomUUID();
        String firstContent = "First independent lifecycle block";
        String secondContent = "Second independent lifecycle block";
        insertUser(userId);
        insertSubject(userId, firstSubjectId, "First independent subject");
        insertSubject(userId, secondSubjectId, "Second independent subject");
        jdbcTemplate.update("insert into knowledge_blocks (id, user_id, subject_id, title, content) "
                        + "values (?, ?, ?, ?, ?)",
                firstBlockId, userId, firstSubjectId, "First independent block", firstContent);
        jdbcTemplate.update("insert into knowledge_blocks (id, user_id, subject_id, title, content) "
                        + "values (?, ?, ?, ?, ?)",
                secondBlockId, userId, secondSubjectId, "Second independent block", secondContent);

        CountDownLatch bothParameterLookupsCompleted = new CountDownLatch(2);
        CountDownLatch releaseParameterLookups = new CountDownLatch(1);
        AtomicInteger parameterLookupCalls = new AtomicInteger();
        AtomicInteger parameterLookupMisses = new AtomicInteger();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            doAnswer(invocation -> {
                parameterLookupCalls.incrementAndGet();
                String scheduler = invocation.getArgument(0);
                int version = invocation.getArgument(1);
                Optional<ReviewParameterSetEntity> result = jdbcTemplate.query(
                        "select id, scheduler, version, parameters from review_parameter_sets "
                                + "where scheduler = ? and version = ?",
                        rs -> rs.next()
                                ? Optional.of(new ReviewParameterSetEntity(UUID.fromString(rs.getString("id")),
                                        rs.getString("scheduler"), rs.getInt("version"), rs.getString("parameters")))
                                : Optional.empty(),
                        scheduler, version);
                if (result.isEmpty()) parameterLookupMisses.incrementAndGet();
                bothParameterLookupsCompleted.countDown();
                await(releaseParameterLookups);
                return result;
            }).when(reviewParameterSetRepository).findBySchedulerAndVersion("FSRS_LITE", 1);

            Future<ReviewLifecycleDtos.CommandResponse> first = executor.submit(() ->
                    reviewLifecycleService.completeLearning(userId,
                            new ReviewLifecycleDtos.LearningCompletionRequest(UUID.randomUUID(), firstBlockId,
                                    0L, 0L, KnowledgeBlockContentHash.sha256(firstContent), null, null, null)));
            Future<ReviewLifecycleDtos.CommandResponse> second = executor.submit(() ->
                    reviewLifecycleService.completeLearning(userId,
                            new ReviewLifecycleDtos.LearningCompletionRequest(UUID.randomUUID(), secondBlockId,
                                    0L, 0L, KnowledgeBlockContentHash.sha256(secondContent), null, null, null)));

            boolean bothLookupsReachedBarrier = bothParameterLookupsCompleted.await(5, TimeUnit.SECONDS);
            releaseParameterLookups.countDown();
            List<ReviewLifecycleDtos.CommandResponse> responses = new ArrayList<>();
            List<Throwable> failures = new ArrayList<>();
            for (Future<ReviewLifecycleDtos.CommandResponse> request : List.of(first, second)) {
                try {
                    responses.add(request.get(10, TimeUnit.SECONDS));
                } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException exception) {
                    failures.add(exception instanceof java.util.concurrent.ExecutionException
                            ? ((java.util.concurrent.ExecutionException) exception).getCause() : exception);
                }
            }

            assertThat(bothLookupsReachedBarrier)
                    .as("both requests should reach the parameter lookup; invocations=%s, misses=%s, failures=%s",
                            parameterLookupCalls.get(), parameterLookupMisses.get(), failures)
                    .isTrue();
            assertThat(failures)
                    .as("independent first-learning commands should not race default parameter creation; "
                            + "empty lookups=%s", parameterLookupMisses.get())
                    .isEmpty();
            assertThat(responses).hasSize(2)
                    .allSatisfy(response -> {
                        assertThat(response.action()).isEqualTo("LEARNING_COMPLETED");
                        assertThat(response.state()).isNotNull();
                    });
            assertThat(parameterLookupMisses).hasValue(0);
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_parameter_sets where scheduler = 'FSRS_LITE' and version = 1",
                    Long.class)).isEqualTo(1L);
            assertLifecycleCompletionCounts(userId, firstBlockId, secondBlockId);
        } finally {
            releaseParameterLookups.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS))
                    .as("independent first-learning workers must terminate")
                    .isTrue();
        }
    }

    @Test
    void reviewLifecycleMigrationPreservesExistingSchedulerParameters() {
        String upgradeSchema = "lifecycle_upgrade_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String jdbcUrl = POSTGRES.getJdbcUrl();
        String username = POSTGRES.getUsername();
        String password = POSTGRES.getPassword();
        Flyway.configure()
                .dataSource(jdbcUrl, username, password)
                .schemas(upgradeSchema, "public")
                .defaultSchema(upgradeSchema)
                .target(MigrationVersion.fromVersion("28"))
                .load()
                .migrate();

        UUID existingParameterId = UUID.randomUUID();
        String existingParameters = "{\"againMinutes\":7,\"hardFactor\":1.1,\"goodFactor\":1.8,\"easyFactor\":2.8}";
        jdbcTemplate.update("insert into " + upgradeSchema
                        + ".review_parameter_sets (id, scheduler, version, parameters) values (?, 'FSRS_LITE', 1, ?)",
                existingParameterId, existingParameters);

        Flyway.configure()
                .dataSource(jdbcUrl, username, password)
                .schemas(upgradeSchema, "public")
                .defaultSchema(upgradeSchema)
                .load()
                .migrate();

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from " + upgradeSchema
                        + ".review_parameter_sets where scheduler = 'FSRS_LITE' and version = 1",
                Long.class)).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                "select id from " + upgradeSchema
                        + ".review_parameter_sets where scheduler = 'FSRS_LITE' and version = 1",
                UUID.class)).isEqualTo(existingParameterId);
        assertThat(jdbcTemplate.queryForObject(
                "select parameters from " + upgradeSchema
                        + ".review_parameter_sets where scheduler = 'FSRS_LITE' and version = 1",
                String.class)).isEqualTo(existingParameters);
    }

    private void assertLifecycleCompletionCounts(UUID userId, UUID firstBlockId, UUID secondBlockId) {
        for (UUID blockId : List.of(firstBlockId, secondBlockId)) {
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_states where user_id = ? and knowledge_block_id = ?",
                    Long.class, userId, blockId)).isEqualTo(1L);
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from review_lifecycle_commands where user_id = ? and knowledge_block_id = ? "
                            + "and action = 'LEARNING_COMPLETED'",
                    Long.class, userId, blockId)).isEqualTo(1L);
        }
    }

    private void awaitPostgresLockWait(Integer blockerPid, Integer backendPid, Future<?> operation) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline && !operation.isDone()) {
            Boolean blockedByFirst = jdbcTemplate.queryForObject(
                    "select ? = any(pg_blocking_pids(?))", Boolean.class, blockerPid, backendPid);
            if (Boolean.TRUE.equals(blockedByFirst)) {
                return;
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new AssertionError(interrupted);
            }
        }
        throw new AssertionError("second lifecycle transaction was not blocked by the first transaction");
    }

    private void insertUser(UUID userId) {
        jdbcTemplate.update(
                "insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                userId, "lock-it-" + userId, ("lock-it-" + userId).toUpperCase(), "integration-test");
    }

    private void insertSubject(UUID userId, UUID subjectId, String name) {
        jdbcTemplate.update(
                "insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                subjectId, userId, name);
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("first transaction did not receive release signal");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError(interrupted);
        }
    }
}
