package com.auralis.app;

import com.auralis.app.identity.AccountDeletionCleanupService;
import com.auralis.app.identity.IdentityException;
import com.auralis.app.identity.IdentityService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
class AccountDeletionCleanupPostgresIntegrationTests {

    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"));

    @Autowired private JdbcTemplate appJdbc;
    @Autowired private IdentityService identityService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private PlatformTransactionManager transactionManager;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET TIME ZONE 'America/Los_Angeles'");
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
            UUID userId = UUID.randomUUID();
            String passwordHash = passwordEncoder.encode("correct-password");
            jdbc.update("insert into users (id, username, normalized_username, password_hash, status) "
                    + "values (?, ?, ?, ?, 'ACTIVE')",
                    userId, "delete-test", "delete-test-" + userId, passwordHash);

            var response = identityService.requestAccountDeletion(userId, "correct-password");

            assertThat(response.status()).isEqualTo("PENDING");
            assertThat(readJobInstant(jdbc, "requested_at", response.id()))
                    .isEqualTo(response.requestedAt().truncatedTo(ChronoUnit.MICROS));
            assertThat(readJobInstant(jdbc, "not_before", response.id()))
                    .isEqualTo(response.requestedAt().plusSeconds(360).truncatedTo(ChronoUnit.MICROS));
            assertThat(jdbc.queryForObject(
                    "select user_id from account_deletion_jobs where id = ?", UUID.class, response.id()))
                    .isEqualTo(userId);
        } finally {
            TimeZone.setDefault(originalDefaultTimeZone);
        }
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

    private void cleansSyntheticJobAndReconcilesLateObjectsAcrossDifferentTimeZones() {
        assertThat(TimeZone.getDefault().getID()).isEqualTo("Asia/Hong_Kong");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure()
                .dataSource(dataSource)
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
}
