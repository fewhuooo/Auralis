package com.auralis.app;

import com.auralis.app.identity.AccountDeletionCleanupService;
import com.auralis.app.identity.IdentityException;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.ai.OverviewGenerationCoordinator;
import com.auralis.app.ai.OverviewHistoricalFixtures;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = {AuralisApplication.class, AccountDeletionCleanupPostgresIntegrationTests.MicrosecondClockConfiguration.class})
@ActiveProfiles("postgres-it")
class AccountDeletionCleanupPostgresIntegrationTests {

    private static final String TEST_SCHEMA = "account_deletion_it_"
            + UUID.randomUUID().toString().replace("-", "");

    @TestConfiguration(proxyBeanMethods = false)
    static class MicrosecondClockConfiguration {
        @Bean
        @Primary
        Clock testClock() {
            return Clock.fixed(Instant.parse("2026-10-13T03:11:06.432415600Z"), ZoneOffset.UTC);
        }
    }

    @Autowired private JdbcTemplate appJdbc;
    @Autowired private IdentityService identityService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private OverviewGenerationCoordinator overviewGenerationCoordinator;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) throws SQLException {
        String url = taskOwnedPostgresUrl();
        try (Connection connection = DriverManager.getConnection(url, "postgres", "");
                Statement statement = connection.createStatement()) {
            statement.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");
            String vectorSchema;
            try (ResultSet result = statement.executeQuery(
                    "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
                            + "WHERE e.extname = 'vector'")) {
                if (!result.next()) {
                    throw new SQLException("PostgreSQL vector extension was not installed");
                }
                vectorSchema = result.getString(1);
            }
            if (!"public".equals(vectorSchema)) {
                statement.execute("ALTER EXTENSION vector SET SCHEMA public");
            }
            statement.execute("create schema " + TEST_SCHEMA);
        }
        registry.add("spring.datasource.url", () -> testSchemaUrl(url));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET TIME ZONE 'America/Los_Angeles'");
        registry.add("spring.flyway.default-schema", () -> TEST_SCHEMA);
        registry.add("spring.flyway.schemas", () -> TEST_SCHEMA);
    }

    private static String taskOwnedPostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }

    private static String testSchemaUrl(String url) {
        return url + "?currentSchema=" + TEST_SCHEMA + ",public";
    }

    @Test
    void cleansSyntheticJobAndReconcilesLateObjectsUsingPostgresTimestampWithTimezoneBindings() {
        TimeZone originalDefaultTimeZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Hong_Kong"));
        try {
            cleansSyntheticJobAndReconcilesLateObjectsAcrossDifferentTimeZones();
        } finally {
            TimeZone.setDefault(originalDefaultTimeZone);
        }
    }

    @Test
    void requestAccountDeletionBindsUtcOffsetDateTimeForPostgresTimestampWithTimezoneColumns() {
        TimeZone originalDefaultTimeZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Hong_Kong"));
        try {
            JdbcTemplate jdbc = appJdbc;
            assertThat(jdbc.queryForObject("show time zone", String.class)).isEqualTo("America/Los_Angeles");
            Instant requestedAt = Instant.parse("2026-10-13T03:11:06.432415600Z");
            Instant persistedAt = Instant.parse("2026-10-13T03:11:06.432416Z");
            UUID userId = UUID.randomUUID();
            String passwordHash = passwordEncoder.encode("correct-password");
            jdbc.update("insert into users (id, username, normalized_username, password_hash, status) "
                    + "values (?, ?, ?, ?, 'ACTIVE')",
                    userId, "delete-test", "delete-test-" + userId, passwordHash);

            var response = identityService.requestAccountDeletion(userId, "correct-password");

            assertThat(response.status()).isEqualTo("PENDING");
            assertThat(response.requestedAt()).isEqualTo(requestedAt);
            assertThat(readJobInstant(jdbc, "requested_at", response.id())).isEqualTo(persistedAt);
            assertThat(readJobInstant(jdbc, "not_before", response.id()))
                    .isEqualTo(persistedAt.plusSeconds(360));
            assertThat(jdbc.queryForObject(
                    "select user_id from account_deletion_jobs where id = ?", UUID.class, response.id()))
                    .isEqualTo(userId);
        } finally {
            TimeZone.setDefault(originalDefaultTimeZone);
        }
    }

    @Test
    void offsetDateTimeBindingsRoundToPostgresMicrosecondsAcrossTieAndSecondCarry() {
        JdbcTemplate jdbc = appJdbc;
        assertThat(jdbc.queryForObject("show time zone", String.class)).isEqualTo("America/Los_Angeles");

        assertThat(roundTripOffset(jdbc, OffsetDateTime.parse("2026-10-13T08:41:06.432415499+05:30")))
                .isEqualTo(Instant.parse("2026-10-13T03:11:06.432415Z"));
        assertThat(roundTripOffset(jdbc, OffsetDateTime.parse("2026-10-13T08:41:06.432415500+05:30")))
                .isEqualTo(Instant.parse("2026-10-13T03:11:06.432416Z"));
        assertThat(roundTripOffset(jdbc, OffsetDateTime.parse("2026-10-13T08:41:06.999999600+05:30")))
                .isEqualTo(Instant.parse("2026-10-13T03:11:07Z"));
    }

    @Test
    void validRequestRunsThroughPostgresCleanupAndRemovesAccountData() {
        UUID userId = UUID.randomUUID();
        String password = "correct-password";
        jdbcInsertSyntheticUser(userId, password);
        UUID subjectId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID assetId = UUID.randomUUID();
        String objectKey = "users/" + userId + "/assets/account-deletion-regression.bin";
        appJdbc.update("insert into subjects (id, user_id, name, sort_key) values (?, ?, 'Deletion regression', '')",
                subjectId, userId);
        appJdbc.update("insert into tasks (id, user_id, subject_id, title, status, sort_key) "
                        + "values (?, ?, ?, 'Deletion regression', 'TODO', '')",
                taskId, userId, subjectId);
        appJdbc.update("insert into assets (id, user_id, object_key, original_name, size_bytes, mime_type, upload_status) "
                        + "values (?, ?, ?, 'account-deletion-regression.bin', 4, 'application/octet-stream', 'READY')",
                assetId, userId, objectKey);
        var generationRequest = new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(), "SUBJECT",
                UUID.randomUUID(), null, HASH_A, HASH_B, HASH_C, "overview-v1");
        var generation = overviewGenerationCoordinator.acquire(generationRequest);
        OverviewHistoricalFixtures.insertCheckpoint(appJdbc, generation.lease(), "MAP:1", "{\"schemaVersion\":1,\"title\":\"private map\"}");

        var response = identityService.requestAccountDeletion(userId, password);

        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(appJdbc.queryForObject("select status from users where id = ?", String.class, userId))
                .isEqualTo("DISABLED");
        Instant cleanupTime = response.requestedAt().plusSeconds(1);
        appJdbc.update("update account_deletion_jobs set not_before = ? where id = ?",
                OffsetDateTime.ofInstant(response.requestedAt().minusSeconds(1), ZoneOffset.UTC), response.id());
        List<String> deletedKeys = new ArrayList<>();
        AccountDeletionCleanupService cleanup = new AccountDeletionCleanupService(
                appJdbc, deletedKeys::add, transactionManager, Clock.fixed(cleanupTime, ZoneOffset.UTC));

        cleanup.processPending();

        assertThat(deletedKeys).containsExactly(objectKey);
        assertThat(appJdbc.queryForObject(
                "select status from account_deletion_jobs where id = ?", String.class, response.id()))
                .isEqualTo("COMPLETED");
        assertThat(appJdbc.queryForObject("select count(*) from users where id = ?", Integer.class, userId)).isZero();
        assertThat(appJdbc.queryForObject("select count(*) from subjects where id = ?", Integer.class, subjectId)).isZero();
        assertThat(appJdbc.queryForObject("select count(*) from tasks where id = ?", Integer.class, taskId)).isZero();
        assertThat(appJdbc.queryForObject("select count(*) from assets where id = ?", Integer.class, assetId)).isZero();
        assertThat(appJdbc.queryForObject("select count(*) from overview_generations where id = ?", Integer.class,
                generation.generationId())).isZero();
        assertThat(appJdbc.queryForObject("select count(*) from overview_generation_requests where request_id = ?",
                Integer.class, generationRequest.requestId())).isZero();
        assertThat(appJdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id = ?",
                Integer.class, generation.generationId())).isZero();
    }

    @Test
    void wrongDeletionPasswordLeavesUserActiveAndDoesNotCreateJob() {
        UUID userId = UUID.randomUUID();
        jdbcInsertSyntheticUser(userId, "correct-password");

        assertThatThrownBy(() -> identityService.requestAccountDeletion(userId, "wrong-password"))
                .isInstanceOf(IdentityException.class);

        assertThat(appJdbc.queryForObject("select status from users where id = ?", String.class, userId))
                .isEqualTo("ACTIVE");
        assertThat(appJdbc.queryForObject(
                "select count(*) from account_deletion_jobs where user_id = ?", Integer.class, userId)).isZero();
    }

    private void jdbcInsertSyntheticUser(UUID userId, String password) {
        String passwordHash = passwordEncoder.encode(password);
        appJdbc.update("insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                userId, "delete-test", "delete-test-" + userId, passwordHash);
    }

    private static final String HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String HASH_C = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    private void cleansSyntheticJobAndReconcilesLateObjectsAcrossDifferentTimeZones() {
        assertThat(TimeZone.getDefault().getID()).isEqualTo("Asia/Hong_Kong");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                testSchemaUrl(taskOwnedPostgresUrl()), "postgres", "");
        Flyway.configure()
                .dataSource(dataSource)
                .defaultSchema(TEST_SCHEMA)
                .schemas(TEST_SCHEMA)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        var sessionTimeZoneDataSource = new DelegatingDataSource(dataSource) {
            @Override
            public Connection getConnection() throws SQLException {
                Connection connection = super.getConnection();
                try (Statement statement = connection.createStatement()) {
                    statement.execute("set time zone 'America/Los_Angeles'");
                    return connection;
                } catch (SQLException exception) {
                    connection.close();
                    throw exception;
                }
            }
        };
        JdbcTemplate jdbc = new JdbcTemplate(sessionTimeZoneDataSource);
        assertThat(jdbc.queryForObject("show time zone", String.class)).isEqualTo("America/Los_Angeles");
        Instant now = Instant.parse("2026-09-25T12:00:00Z");
        UUID jobId = UUID.randomUUID();
        UUID syntheticUserId = UUID.randomUUID();
        jdbc.update("insert into account_deletion_jobs (id, user_id, status, requested_at, not_before) "
                        + "values (?, ?, 'PENDING', ?, ?)",
                jobId, syntheticUserId,
                OffsetDateTime.ofInstant(now.minusSeconds(10), ZoneOffset.UTC),
                OffsetDateTime.ofInstant(now.minusSeconds(1), ZoneOffset.UTC));
        jdbc.update("insert into account_deletion_objects (job_id, object_key) values (?, ?)",
                jobId, "synthetic/initial-object");

        List<String> deletedKeys = new ArrayList<>();
        List<Instant> observedLeaseInstants = new ArrayList<>();
        AccountDeletionCleanupService service = new AccountDeletionCleanupService(
                jdbc,
                objectKey -> {
                    deletedKeys.add(objectKey);
                    observedLeaseInstants.add(readJobInstant(jdbc, "lease_until", jobId));
                },
                new DataSourceTransactionManager(dataSource),
                Clock.fixed(now, java.time.ZoneOffset.UTC));

        assertThat(service.processPending()).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select status from account_deletion_jobs where id = ?", String.class, jobId))
                .isEqualTo("COMPLETED");
        assertThat(readObjectInstant(jdbc, jobId, "synthetic/initial-object")).isEqualTo(now);
        assertThat(readJobInstant(jdbc, "completed_at", jobId)).isEqualTo(now);
        assertThat(readJobInstant(jdbc, "next_object_scan_at", jobId))
                .isEqualTo(now.plusSeconds(24 * 60 * 60));

        jdbc.update("insert into account_deletion_objects (job_id, object_key) values (?, ?)",
                jobId, "synthetic/late-object");
        jdbc.update("update account_deletion_jobs set next_object_scan_at = ? where id = ?",
                OffsetDateTime.ofInstant(now.minusSeconds(1), ZoneOffset.UTC), jobId);

        assertThat(service.processPending()).isZero();
        assertThat(deletedKeys).containsExactlyInAnyOrder(
                "synthetic/initial-object", "synthetic/initial-object", "synthetic/late-object");
        assertThat(observedLeaseInstants).containsExactly(
                now.plusSeconds(30 * 60), now.plusSeconds(30 * 60), now.plusSeconds(30 * 60));
        assertThat(readJobInstant(jdbc, "next_object_scan_at", jobId))
                .isEqualTo(now.plusSeconds(24 * 60 * 60));
        assertThat(readJobInstant(jdbc, "lease_until", jobId)).isNull();
    }

    private Instant readJobInstant(JdbcTemplate jdbc, String column, UUID jobId) {
        return jdbc.queryForObject("select " + column + " from account_deletion_jobs where id = ?",
                (resultSet, rowNum) -> {
                    OffsetDateTime value = resultSet.getObject(1, OffsetDateTime.class);
                    return value == null ? null : value.toInstant();
                }, jobId);
    }

    private Instant readObjectInstant(JdbcTemplate jdbc, UUID jobId, String objectKey) {
        return jdbc.queryForObject(
                "select deleted_at from account_deletion_objects where job_id = ? and object_key = ?",
                (resultSet, rowNum) -> resultSet.getObject(1, OffsetDateTime.class).toInstant(), jobId, objectKey);
    }

    private Instant roundTripOffset(JdbcTemplate jdbc, OffsetDateTime value) {
        return jdbc.queryForObject("select ?::timestamp with time zone",
                (resultSet, rowNum) -> resultSet.getObject(1, OffsetDateTime.class).toInstant(), value);
    }
}
