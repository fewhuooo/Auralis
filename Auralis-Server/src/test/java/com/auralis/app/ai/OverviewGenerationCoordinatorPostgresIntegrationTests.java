package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiUsageLimitException;
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
        firstCoordinator.saveCheckpoint(owner.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1,
                "{\"schemaVersion\":1,\"title\":\"map\"}");
        assertThat(firstCoordinator.fail(owner.lease(), "MODEL_TIMEOUT",
                new AiProviderUsage(10, 20, null, null, 30, false), 1, List.of("REPACK"))).isTrue();

        var retry = otherCoordinator.acquire(request(userId, subjectId, UUID.randomUUID()));
        assertThat(retry.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(retry.generationId()).isEqualTo(owner.generationId());
        assertThat(retry.budgetTaskId()).isEqualTo(owner.budgetTaskId());
        assertThat(retry.lease().fence()).isGreaterThan(owner.lease().fence());
        assertThat(otherCoordinator.loadCheckpoint(retry.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1))
                .extracting(OverviewGenerationCoordinator.Checkpoint::payloadJson)
                .isEqualTo("{\"schemaVersion\":1,\"title\":\"map\"}");
        assertThat(firstCoordinator.complete(owner.lease(), "{\"schemaVersion\":1}",
                new AiProviderUsage(0, 0, 0L, 0L, 0, true), 0, List.of())).isFalse();
        assertThatThrownBy(() -> firstCoordinator.saveCheckpoint(owner.lease(), "MAP:1", HASH_A, HASH_C,
                "overview-v1", 1, "{\"schemaVersion\":1}"))
                .isInstanceOf(AiUsageLimitException.class)
                .satisfies(error -> {
                    var limit = (AiUsageLimitException) error;
                    assertThat(limit.code()).isEqualTo("AI_CONCURRENCY_LIMIT");
                    assertThat(limit.status()).isEqualTo(429);
                    assertThat(limit.retryAfterSeconds()).isPositive();
                });

        assertThat(otherCoordinator.complete(retry.lease(), "{\"schemaVersion\":1}",
                new AiProviderUsage(10, 20, 9L, 18L, 27, true), 0, List.of())).isTrue();
        assertThat(firstCoordinator.acquire(firstRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.REPLAY);
        assertThat(firstCoordinator.acquire(concurrentRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.REPLAY);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class,
                userId)).isEqualTo(1);
        otherHeartbeat.shutdownNow();
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
            firstCoordinator.saveCheckpoint(oldOwner.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1,
                    "{\"schemaVersion\":1,\"title\":\"checkpoint\"}");
            jdbc.update("update overview_generations set lease_until=? where id=?",
                    java.time.OffsetDateTime.now().minusSeconds(1), oldOwner.generationId());

            var takeover = otherCoordinator.acquire(request(userId, subjectId, UUID.randomUUID()));

            assertThat(takeover.generationId()).isEqualTo(oldOwner.generationId());
            assertThat(takeover.budgetTaskId()).isEqualTo(oldOwner.budgetTaskId());
            assertThat(takeover.lease().fence()).isGreaterThan(oldOwner.lease().fence());
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
