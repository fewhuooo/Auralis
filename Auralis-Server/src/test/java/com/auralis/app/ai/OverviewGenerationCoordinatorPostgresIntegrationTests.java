package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.AuralisApplication;
import com.auralis.app.shared.error.DomainException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Clock;
import java.time.Duration;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
class OverviewGenerationCoordinatorPostgresIntegrationTests {

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

    @Autowired private JdbcTemplate jdbc;
    @Autowired private OverviewGenerationCoordinator firstCoordinator;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private Clock clock;

    @Test
    void cleanV32AndV31UpgradeRunOnDedicatedTemporaryPostgresDatabase() throws Exception {
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='32' and success=true",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='public' "
                        + "and table_name in ('overview_generations','overview_generation_requests','overview_generation_checkpoints')",
                Integer.class)).isEqualTo(3);
        assertFailureMetadataColumns(jdbc);
        assertRetryLineageSchema(jdbc);

        String databaseName = "overview_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute("create database \"" + databaseName + "\"");
        }
        int slash = POSTGRES.getJdbcUrl().lastIndexOf('/');
        String upgradeUrl = POSTGRES.getJdbcUrl().substring(0, slash + 1) + databaseName;
        DriverManagerDataSource upgradeDataSource = new DriverManagerDataSource(
                upgradeUrl, POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(upgradeDataSource).locations("classpath:db/migration").target("31").load().migrate();
        JdbcTemplate upgradeJdbc = new JdbcTemplate(upgradeDataSource);
        assertThat(upgradeJdbc.queryForObject("select count(*) from flyway_schema_history where version='31' and success=true",
                Integer.class)).isEqualTo(1);
        assertThat(upgradeJdbc.queryForObject("select count(*) from information_schema.tables where table_schema='public' "
                        + "and table_name='overview_generations'", Integer.class)).isZero();
        UUID preservedUserId = UUID.randomUUID();
        String username = "overview-upgrade-" + preservedUserId;
        upgradeJdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                        + "values (?,?,?,'synthetic-hash','ACTIVE')",
                preservedUserId, username, username.toLowerCase(java.util.Locale.ROOT));

        Flyway.configure().dataSource(upgradeDataSource).locations("classpath:db/migration").load().migrate();

        assertThat(upgradeJdbc.queryForObject("select count(*) from users where id=?", Integer.class,
                preservedUserId)).isEqualTo(1);
        assertThat(upgradeJdbc.queryForObject("select count(*) from flyway_schema_history where version='32' and success=true",
                Integer.class)).isEqualTo(1);
        assertThat(upgradeJdbc.queryForObject("select count(*) from information_schema.tables where table_schema='public' "
                        + "and table_name in ('overview_generations','overview_generation_requests','overview_generation_checkpoints')",
                Integer.class)).isEqualTo(3);
        assertFailureMetadataColumns(upgradeJdbc);
        assertRetryLineageSchema(upgradeJdbc);
    }

    @Test
    void independentCoordinatorsSerializeOwnersAndFenceStaleWrites() throws Exception {
        ScheduledExecutorService otherHeartbeat = Executors.newSingleThreadScheduledExecutor();
        var otherCoordinator = new OverviewGenerationCoordinator(jdbc, transactionManager, clock,
                30_000, 2_000, otherHeartbeat);
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        String username = "overview-it-" + userId;
        jdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                        + "values (?,?,?,'synthetic-hash','ACTIVE')",
                userId, username, username.toLowerCase(java.util.Locale.ROOT));

        var firstRequest = request(userId, subjectId, UUID.randomUUID());
        var concurrentRequest = request(userId, subjectId, UUID.randomUUID());
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        OverviewGenerationCoordinator.Acquisition first;
        OverviewGenerationCoordinator.Acquisition second;
        try {
            var firstFuture = pool.submit(() -> {
                start.await();
                return firstCoordinator.acquire(firstRequest);
            });
            var secondFuture = pool.submit(() -> {
                start.await();
                return otherCoordinator.acquire(concurrentRequest);
            });
            start.countDown();
            first = firstFuture.get(10, TimeUnit.SECONDS);
            second = secondFuture.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        var owner = first.state() == OverviewGenerationCoordinator.AcquisitionState.OWNER ? first : second;
        var waiter = first.state() == OverviewGenerationCoordinator.AcquisitionState.WAITER ? first : second;
        assertThat(List.of(first.state(), second.state()))
                .containsExactlyInAnyOrder(OverviewGenerationCoordinator.AcquisitionState.OWNER,
                        OverviewGenerationCoordinator.AcquisitionState.WAITER);
        assertThat(waiter.generationId()).isEqualTo(owner.generationId());
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_requests where generation_id=?",
                Integer.class, owner.generationId())).isEqualTo(2);
        assertThat(firstCoordinator.fail(owner.lease(), "MODEL_TIMEOUT",
                new AiProviderUsage(10, 20, null, null, 30, false), 1, List.of("REPACK"))).isTrue();

        UUID retryRequestId = UUID.randomUUID();
        var retry = otherCoordinator.acquire(retryRequest(userId, subjectId, retryRequestId, firstRequest.requestId()));
        assertThat(retry.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(retry.generationId()).isNotEqualTo(owner.generationId());
        assertThat(retry.budgetTaskId()).isNotEqualTo(owner.budgetTaskId());
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?", UUID.class,
                retry.generationId())).isEqualTo(owner.generationId());
        assertThat(firstCoordinator.complete(owner.lease(), "{\"schemaVersion\":1}",
                new AiProviderUsage(0, 0, 0L, 0L, 0, true), 0, List.of())).isFalse();

        assertThat(otherCoordinator.complete(retry.lease(), "{\"schemaVersion\":1}",
                new AiProviderUsage(10, 20, 9L, 18L, 27, true), 0, List.of())).isTrue();
        assertThat(firstCoordinator.acquire(retryRequest(userId, subjectId, retryRequestId, firstRequest.requestId())).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.REPLAY);
        assertThat(firstCoordinator.acquire(firstRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        assertThat(firstCoordinator.acquire(concurrentRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class,
                userId)).isEqualTo(2);
        otherHeartbeat.shutdownNow();
    }

    @Test
    void directRetryRejectsAnUnrelatedLiveGenerationWithTheSameActualIdentity() {
        UUID userId = createUser();
        UUID scopeId = UUID.randomUUID();
        var parentRequest = request(userId, scopeId, UUID.randomUUID());
        var parent = firstCoordinator.acquire(parentRequest);
        assertThat(firstCoordinator.fail(parent.lease(), "MODEL_PROVIDER_ERROR",
                new AiProviderUsage(10, 20, 9L, 18L, 27, true), 0, List.of())).isTrue();
        var unrelated = firstCoordinator.acquire(request(userId, scopeId, UUID.randomUUID()));
        var retry = retryRequest(userId, scopeId, UUID.randomUUID(), parentRequest.requestId());

        assertThatThrownBy(() -> firstCoordinator.acquire(retry))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                parent.generationId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                unrelated.generationId())).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where retry_of_generation_id=?",
                Integer.class, parent.generationId())).isZero();
    }

    @Test
    void retrySuccessorUniqueIndexAllowsNullParentsAndRejectsASecondChild() {
        UUID userId = createUser();
        UUID parentScope = UUID.randomUUID();
        var parentRequest = request(userId, parentScope, UUID.randomUUID());
        var parent = firstCoordinator.acquire(parentRequest);
        assertThat(firstCoordinator.fail(parent.lease(), "MODEL_PROVIDER_ERROR",
                new AiProviderUsage(10, 20, 9L, 18L, 27, true), 0, List.of())).isTrue();
        var child = firstCoordinator.acquire(retryRequest(userId, parentScope,
                UUID.randomUUID(), parentRequest.requestId()));
        var firstOrdinary = firstCoordinator.acquire(request(userId, UUID.randomUUID(), UUID.randomUUID()));
        var secondOrdinary = firstCoordinator.acquire(request(userId, UUID.randomUUID(), UUID.randomUUID()));

        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=? "
                + "and retry_of_generation_id is null", Integer.class, userId)).isEqualTo(3);
        assertThatThrownBy(() -> jdbc.update("update overview_generations set retry_of_generation_id=? where id=?",
                parent.generationId(), firstOrdinary.generationId()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, child.generationId())).isEqualTo(parent.generationId());
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, secondOrdinary.generationId())).isNull();
    }

    @Test
    void directRetryIgnoresHistoricalJobRowsWhenFencingExpiredGeneration() {
        UUID userId = createUser();
        UUID scopeId = UUID.randomUUID();
        var parentRequest = request(userId, scopeId, UUID.randomUUID());
        var parent = firstCoordinator.acquire(parentRequest);
        assertThat(firstCoordinator.fail(parent.lease(), "MODEL_PROVIDER_ERROR",
                new AiProviderUsage(10, 20, 9L, 18L, 27, true), 0, List.of())).isTrue();
        var expiredDirect = firstCoordinator.acquire(request(userId, scopeId, UUID.randomUUID()));
        jdbc.update("update overview_generations set lease_until=? where id=?",
                clock.instant().minusSeconds(2).atOffset(java.time.ZoneOffset.UTC), expiredDirect.generationId());

        var child = firstCoordinator.acquire(retryRequest(userId, scopeId,
                UUID.randomUUID(), parentRequest.requestId()));

        assertThat(child.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                expiredDirect.generationId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, child.generationId())).isEqualTo(parent.generationId());

        UUID jobOwnedScope = UUID.randomUUID();
        var secondParentRequest = request(userId, jobOwnedScope, UUID.randomUUID());
        var secondParent = firstCoordinator.acquire(secondParentRequest);
        assertThat(firstCoordinator.fail(secondParent.lease(), "MODEL_PROVIDER_ERROR",
                new AiProviderUsage(10, 20, 9L, 18L, 27, true), 0, List.of())).isTrue();
        var jobOwned = firstCoordinator.acquire(request(userId, jobOwnedScope, UUID.randomUUID()));
        jdbc.update("update overview_generations set lease_until=? where id=?",
                clock.instant().minusSeconds(2).atOffset(java.time.ZoneOffset.UTC), jobOwned.generationId());
        insertHistoricalJob(userId, jobOwnedScope, jobOwned.generationId(), jobOwned.budgetTaskId());

        var historicalJobRetry = firstCoordinator.acquire(retryRequest(userId, jobOwnedScope,
                UUID.randomUUID(), secondParentRequest.requestId()));
        assertThat(historicalJobRetry.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                jobOwned.generationId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, historicalJobRetry.generationId())).isEqualTo(secondParent.generationId());
    }

    private UUID createUser() {
        UUID userId = UUID.randomUUID();
        String username = "overview-retry-it-" + userId;
        jdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                        + "values (?,?,?,'synthetic-hash','ACTIVE')",
                userId, username, username.toLowerCase(java.util.Locale.ROOT));
        return userId;
    }

    private void insertHistoricalJob(UUID userId, UUID scopeId, UUID generationId, UUID budgetTaskId) {
        jdbc.update("insert into overview_generation_jobs (id,user_id,client_request_id,generation_request_id,scope_type,scope_id,"
                        + "mode,request_hash,request_json,source_manifest_json,input_fingerprint,profile_fingerprint,algorithm_version,"
                        + "generation_id,budget_task_id,status,stage,verified_nodes) "
                        + "values (?,?,?,?,'SUBJECT',?,'ALL',?,'{}','[]',?,?,?, ?,?,'FAILED','QUEUED',0)",
                UUID.randomUUID(), userId, UUID.randomUUID(), UUID.randomUUID(), scopeId, HASH_D, HASH_A, HASH_C,
                "overview-v1", generationId, budgetTaskId);
    }

    private OverviewGenerationCoordinator.Request retryRequest(UUID userId, UUID scopeId, UUID requestId,
                                                                 UUID retryOfRequestId) {
        return new OverviewGenerationCoordinator.Request(userId, requestId, "SUBJECT", scopeId, null,
                HASH_A, HASH_B, HASH_C, "overview-v1", List.of(), retryOfRequestId);
    }

    @Test
    void independentCoordinatorTakesOverExpiredLeaseAndFencesOldOwnerOnPostgres() {
        ScheduledExecutorService otherHeartbeat = Executors.newSingleThreadScheduledExecutor();
        var otherCoordinator = new OverviewGenerationCoordinator(jdbc, transactionManager, clock,
                30_000, 2_000, otherHeartbeat);
        try {
            UUID userId = UUID.randomUUID();
            UUID subjectId = UUID.randomUUID();
            String username = "overview-expired-" + userId;
            jdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                            + "values (?,?,?,'synthetic-hash','ACTIVE')",
                    userId, username, username.toLowerCase(java.util.Locale.ROOT));
            var originalRequest = request(userId, subjectId, UUID.randomUUID());
            var oldOwner = firstCoordinator.acquire(originalRequest);
            jdbc.update("update overview_generations set lease_until=? where id=?",
                    java.time.OffsetDateTime.now().minusSeconds(1), oldOwner.generationId());

            var takeover = otherCoordinator.acquire(request(userId, subjectId, UUID.randomUUID()));

            assertThat(takeover.generationId()).isNotEqualTo(oldOwner.generationId());
            assertThat(takeover.budgetTaskId()).isNotEqualTo(oldOwner.budgetTaskId());
            assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                    oldOwner.generationId())).isEqualTo("FAILED");
            assertThat(firstCoordinator.complete(oldOwner.lease(), "{\"schemaVersion\":1}",
                    new AiProviderUsage(1, 1, 1L, 1L, 2, true), 0, List.of())).isFalse();
            assertThat(otherCoordinator.complete(takeover.lease(), "{\"schemaVersion\":1}",
                    new AiProviderUsage(1, 1, 1L, 1L, 2, true), 0, List.of())).isTrue();
        } finally {
            otherHeartbeat.shutdownNow();
        }
    }

    @Test
    void independentPostgresWaiterReceivesDurableUsageFailureDetails() {
        ScheduledExecutorService otherHeartbeat = Executors.newSingleThreadScheduledExecutor();
        var otherCoordinator = new OverviewGenerationCoordinator(jdbc, transactionManager, clock,
                30_000, 2_000, otherHeartbeat);
        try {
            UUID userId = UUID.randomUUID();
            UUID subjectId = UUID.randomUUID();
            String username = "overview-quota-it-" + userId;
            jdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                            + "values (?,?,?,'synthetic-hash','ACTIVE')",
                    userId, username, username.toLowerCase(java.util.Locale.ROOT));
            var owner = firstCoordinator.acquire(request(userId, subjectId, UUID.randomUUID()));
            var waiter = otherCoordinator.acquire(request(userId, subjectId, UUID.randomUUID()));
            var details = new OverviewGenerationCoordinator.FailureDetails(429, 23,
                    java.time.Instant.parse("2026-10-13T04:00:00Z"));

            assertThat(waiter.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
            assertThat(firstCoordinator.fail(owner.lease(), "AI_HOURLY_QUOTA_EXCEEDED", details,
                    new com.auralis.app.ai.usage.OverviewTaskUsageSummary(10, 20, null, null, 27, 1, 0, false),
                    0, List.of())).isTrue();
            var outcome = otherCoordinator.await(waiter, Duration.ofSeconds(1), () -> false);
            assertThat(outcome.errorCode()).isEqualTo("AI_HOURLY_QUOTA_EXCEEDED");
            assertThat(outcome.failureDetails()).isEqualTo(details);
        } finally {
            otherHeartbeat.shutdownNow();
        }
    }

    private void assertFailureMetadataColumns(JdbcTemplate database) {
        assertThat(database.queryForObject("select count(*) from information_schema.columns "
                        + "where table_schema='public' and table_name='overview_generations' and column_name in "
                        + "('error_status','error_retry_after_seconds','error_reset_at')", Integer.class))
                .isEqualTo(3);
    }

    private void assertRetryLineageSchema(JdbcTemplate database) {
        assertThat(database.queryForObject("select count(*) from information_schema.columns "
                        + "where table_schema='public' and ((table_name='overview_generations' "
                        + "and column_name='retry_of_generation_id') or (table_name='overview_generation_requests' "
                        + "and column_name='retry_of_request_id'))", Integer.class)).isEqualTo(2);
        assertThat(database.queryForObject("select count(*) from pg_indexes where schemaname='public' "
                        + "and indexname='uq_overview_generations_retry_successor'", Integer.class)).isEqualTo(1);
        assertThat(database.queryForObject("select count(*) from information_schema.table_constraints "
                        + "where table_schema='public' and constraint_name='fk_overview_generations_retry_parent'",
                Integer.class)).isEqualTo(1);
    }

    private OverviewGenerationCoordinator.Request request(UUID userId, UUID subjectId, UUID requestId) {
        return request(userId, subjectId, requestId, HASH_C);
    }

    private OverviewGenerationCoordinator.Request request(UUID userId, UUID subjectId, UUID requestId,
                                                          String profileFingerprint) {
        return new OverviewGenerationCoordinator.Request(userId, requestId, "SUBJECT", subjectId, null,
                HASH_A, HASH_B, profileFingerprint, "overview-v1");
    }

    private static final String HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String HASH_C = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    private static final String HASH_D = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
}
