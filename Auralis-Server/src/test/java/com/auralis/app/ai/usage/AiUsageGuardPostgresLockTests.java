package com.auralis.app.ai.usage;



import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AiUsageGuardPostgresLockTests {

    private static final String APPLICATION_NAME = "ai_usage_guard_it";
    private DriverManagerDataSource adminDataSource;
    private DataSource dataSource;
    private JdbcTemplate jdbc;
    private String schema;

    @BeforeEach
    void createIsolatedSchema() throws Exception {
        String url = System.getenv("AURALIS_TEST_POSTGRES_URL");
        assumeTrue(url != null && url.matches("jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+"),
                "Set AURALIS_TEST_POSTGRES_URL to an isolated loopback PostgreSQL database");
        schema = "usage_guard_it_" + UUID.randomUUID().toString().replace("-", "");
        adminDataSource = new DriverManagerDataSource(url, "postgres", "");
        new JdbcTemplate(adminDataSource).execute("create schema " + schema);
        dataSource = new DriverManagerDataSource(url + "?currentSchema=" + schema
                + "&ApplicationName=" + APPLICATION_NAME, "postgres", "");
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("create table users (id UUID primary key, status varchar(16) not null)");
        jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
        }
    }

    @AfterEach
    void dropIsolatedSchema() {
        if (schema != null && adminDataSource != null) {
            new JdbcTemplate(adminDataSource).execute("drop schema if exists " + schema + " cascade");
        }
    }

    @Test
    void reservationWaitsOnUserBeforeTakingGlobalQuotaLockDuringAccountDeletion() throws Exception {
        UUID deletingUser = createUser();
        UUID otherUser = createUser();
        AiUsageGuard guard = guard();
        AiUsageGuard.TaskLease deletingTask = guard.beginTask(
                new AiTaskContext(deletingUser, AiFeature.CHAT, "delete-race-a"));
        AiUsageGuard.TaskLease otherTask = guard.beginTask(
                new AiTaskContext(otherUser, AiFeature.CHAT, "delete-race-b"));
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try (Connection deletion = dataSource.getConnection()) {
            deletion.setAutoCommit(false);
            try (PreparedStatement statement = deletion.prepareStatement(
                    "select id from users where id=? for update")) {
                statement.setObject(1, deletingUser);
                try (ResultSet result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                }
            }

            Future<AiUsageGuard.CallReservation> waitingReservation = executor.submit(() -> guard.reserve(
                    deletingTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 0));
            assertThat(awaitLockWait(Duration.ofSeconds(3))).isTrue();
            Future<AiUsageGuard.CallReservation> unrelatedReservation = executor.submit(() -> guard.reserve(
                    otherTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 0));
            boolean globalLockRemainsAvailable = completes(unrelatedReservation, Duration.ofSeconds(2));

            if (!globalLockRemainsAvailable) {
                SQLException failure = null;
                try (PreparedStatement delete = deletion.prepareStatement("delete from users where id=?")) {
                    delete.setObject(1, deletingUser);
                    delete.executeUpdate();
                } catch (SQLException exception) {
                    failure = exception;
                }
                org.junit.jupiter.api.Assertions.assertNotNull(failure,
                        "the old lock order should expose the PostgreSQL deadlock");
                assertThat(failure.getSQLState()).isEqualTo("40P01");
                throw new AssertionError("Usage reservation held GLOBAL while waiting on users FK; SQLSTATE="
                        + failure.getSQLState(), failure);
            }

            try (PreparedStatement delete = deletion.prepareStatement("delete from users where id=?")) {
                delete.setObject(1, deletingUser);
                assertThat(delete.executeUpdate()).isEqualTo(1);
            }
            deletion.commit();

            assertThatThrownBy(() -> waitingReservation.get(3, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .rootCause()
                    .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                    .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                    .isEqualTo("UNAUTHENTICATED");
            assertThat(jdbc.queryForObject("select count(*) from ai_usage_locks where scope_key='GLOBAL'",
                    Integer.class)).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void taskAdmissionWaitsOnUserBeforeTakingGlobalLockDuringAccountDeletion() throws Exception {
        UUID deletingUser = createUser();
        UUID otherUser = createUser();
        AiUsageGuard guard = guard();
        AiTaskContext deletingContext = new AiTaskContext(deletingUser, AiFeature.CHAT, "begin-delete-race");
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try (Connection deletion = dataSource.getConnection()) {
            deletion.setAutoCommit(false);
            lockUser(deletion, deletingUser);
            Future<AiUsageGuard.TaskLease> waitingTask = executor.submit(() -> guard.beginTask(deletingContext));
            assertThat(awaitLockWait(Duration.ofSeconds(3))).isTrue();
            Future<AiUsageGuard.TaskLease> unrelatedTask = executor.submit(() -> guard.beginTask(
                    new AiTaskContext(otherUser, AiFeature.CHAT, "begin-delete-race-other")));
            assertThat(completes(unrelatedTask, Duration.ofSeconds(2)))
                    .as("task admission must not hold the global quota row while waiting on the account row")
                    .isTrue();
            deleteUser(deletion, deletingUser);
            deletion.commit();
            assertInactive(waitingTask);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void reserveRechecksDisabledStatusAfterWaitingForTheUserRow() throws Exception {
        UUID user = createUser();
        AiUsageGuard guard = guard();
        AiUsageGuard.TaskLease task = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "disable-race"));
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try (Connection disabling = dataSource.getConnection()) {
            disabling.setAutoCommit(false);
            try (PreparedStatement statement = disabling.prepareStatement("update users set status='DISABLED' where id=?")) {
                statement.setObject(1, user);
                assertThat(statement.executeUpdate()).isEqualTo(1);
            }
            Future<AiUsageGuard.CallReservation> waiting = executor.submit(() -> guard.reserve(
                    task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 0));
            assertThat(awaitLockWait(Duration.ofSeconds(3))).isTrue();
            disabling.commit();
            assertInactive(waiting);
            assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void dispatchWaitsOnUserBeforeGlobalAndRejectsAfterDisableCommits() throws Exception {
        UUID user = createUser();
        UUID otherUser = createUser();
        AiUsageGuard guard = guard();
        AiUsageGuard.TaskLease task = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "dispatch-disable-race"));
        AiUsageGuard.CallReservation call = guard.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 10);
        AiUsageGuard.TaskLease otherTask = guard.beginTask(
                new AiTaskContext(otherUser, AiFeature.CHAT, "dispatch-disable-unrelated"));
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try (Connection disabling = dataSource.getConnection()) {
            disabling.setAutoCommit(false);
            try (PreparedStatement statement = disabling.prepareStatement(
                    "update users set status='DISABLED' where id=?")) {
                statement.setObject(1, user);
                assertThat(statement.executeUpdate()).isEqualTo(1);
            }
            Future<?> waitingDispatch = executor.submit(() -> guard.markDispatched(task, call));
            assertThat(awaitLockWait(Duration.ofSeconds(3))).isTrue();
            Future<AiUsageGuard.CallReservation> unrelated = executor.submit(() -> guard.reserve(
                    otherTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 0));
            assertThat(completes(unrelated, Duration.ofSeconds(2)))
                    .as("dispatch must wait on the user row before holding the global quota lock")
                    .isTrue();
            disabling.commit();
            assertInactive(waitingDispatch);
            assertThat(jdbc.queryForObject("select request_dispatched from ai_usage_reservations where id=?",
                    Boolean.class, call.id())).isFalse();
            AiProviderUsage released = guard.settle(task, call, null, false, "UNAUTHENTICATED");
            assertThat(released.chargedTokens()).isZero();
            assertThat(jdbc.queryForObject("select state from ai_usage_reservations where id=?",
                    String.class, call.id())).isEqualTo("RELEASED");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void chatAndOverviewCannotOversellSharedPlatformHourlyQuota() throws Exception {
        UUID user = createUser();
        AuralisProperties.Limits tightWindow = new AuralisProperties.Limits(4, 2, 100, 200,
                2_000_000, 300_000, 10_000, 4_096, 2, 32_000, 24, 524_288, 512, 16_777_216);
        AiUsageGuard guard = guard(tightWindow);

        AiUsageGuard.TaskLease existingTask = guard.beginTask(
                new AiTaskContext(user, AiFeature.CHAT, "shared-window-existing"));
        AiUsageGuard.CallReservation existing = guard.reserve(existingTask, AiStage.CHAT_COMPLETION,
                AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 40, 0);
        guard.markDispatched(existingTask, existing);
        guard.settle(existingTask, existing, new AiTokenUsage(40L, 0L), true, null);
        guard.closeTask(existingTask);

        AiUsageGuard.TaskLease chatTask = guard.beginTask(
                new AiTaskContext(user, AiFeature.CHAT, "shared-window-chat-contender"));
        AiUsageGuard.TaskLease overviewTask = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "shared-window-overview-contender"));
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        ReserveOutcome chatOutcome = null;
        ReserveOutcome overviewOutcome = null;
        try {
            Future<ReserveOutcome> chat = executor.submit(() -> reserveAtBarrier(
                    ready, start, "CHAT", guard, chatTask, AiStage.CHAT_COMPLETION));
            Future<ReserveOutcome> overview = executor.submit(() -> reserveAtBarrier(
                    ready, start, "SOURCE_OVERVIEW", guard, overviewTask, AiStage.OVERVIEW_MAP));
            assertThat(ready.await(3, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            chatOutcome = chat.get(5, TimeUnit.SECONDS);
            overviewOutcome = overview.get(5, TimeUnit.SECONDS);

            List<ReserveOutcome> outcomes = List.of(chatOutcome, overviewOutcome);
            assertThat(outcomes.stream().filter(outcome -> outcome.reservation() != null)).hasSize(1);
            assertThat(outcomes.stream().filter(outcome -> outcome.rejectionCode() != null)
                    .map(ReserveOutcome::rejectionCode)).containsExactly("AI_HOURLY_QUOTA_EXCEEDED");
            assertThat(platformWindowExposure(user)).isLessThanOrEqualTo(100L);

            ReserveOutcome winner = outcomes.stream().filter(outcome -> outcome.reservation() != null)
                    .findFirst().orElseThrow();
            AiUsageGuard.TaskLease winningTask = winner.feature().equals("CHAT") ? chatTask : overviewTask;
            guard.markDispatched(winningTask, winner.reservation());
            guard.settle(winningTask, winner.reservation(), new AiTokenUsage(40L, 0L), true, null);
            assertThat(platformWindowExposure(user)).isLessThanOrEqualTo(100L);
        } finally {
            executor.shutdownNow();
            guard.closeTask(chatTask);
            guard.closeTask(overviewTask);
        }
    }

    private ReserveOutcome reserveAtBarrier(CountDownLatch ready, CountDownLatch start, String feature,
                                            AiUsageGuard guard, AiUsageGuard.TaskLease task,
                                            AiStage stage) throws InterruptedException {
        ready.countDown();
        if (!start.await(3, TimeUnit.SECONDS)) throw new IllegalStateException("quota race start barrier timed out");
        try {
            return new ReserveOutcome(feature, guard.reserve(task, stage, AiProviderType.DEEPSEEK,
                    feature.equals("CHAT") ? "chat-model" : "overview-model", AiCredentialSource.PLATFORM,
                    feature.equals("CHAT") ? AiOutputRole.GENERAL : AiOutputRole.INTERMEDIATE, 40, 0), null);
        } catch (AiUsageLimitException exception) {
            return new ReserveOutcome(feature, null, exception.code());
        }
    }

    private long platformWindowExposure(UUID user) {
        Long exposure = jdbc.queryForObject("select coalesce(sum(charged_tokens),0) + "
                + "coalesce(sum(case when credential_source='PLATFORM' and state='RESERVED' "
                + "and lease_until > now() then estimated_input_tokens+reserved_output_tokens else 0 end),0) "
                + "from ai_usage_reservations where user_id=? and (credential_source='PLATFORM' "
                + "or credential_source is null) and created_at >= date_trunc('hour', now())", Long.class, user);
        return exposure == null ? 0 : exposure;
    }

    private record ReserveOutcome(String feature, AiUsageGuard.CallReservation reservation, String rejectionCode) { }

    private void lockUser(Connection connection, UUID userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("select id from users where id=? for update")) {
            statement.setObject(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
            }
        }
    }

    private void deleteUser(Connection connection, UUID userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("delete from users where id=?")) {
            statement.setObject(1, userId);
            assertThat(statement.executeUpdate()).isEqualTo(1);
        }
    }

    private void assertInactive(Future<?> future) throws Exception {
        assertThatThrownBy(() -> future.get(3, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .rootCause()
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("UNAUTHENTICATED");
    }

    private boolean awaitLockWait(Duration timeout) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            Integer waiting = jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() "
                    + "and application_name=? and state='active' and wait_event_type='Lock'",
                    Integer.class, APPLICATION_NAME);
            if (waiting != null && waiting > 0) return true;
            Thread.sleep(10);
        }
        return false;
    }

    private boolean completes(Future<?> future, Duration timeout) throws Exception {
        try {
            future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            return true;
        } catch (java.util.concurrent.TimeoutException exception) {
            return false;
        }
    }

    private UUID createUser() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into users(id,status) values (?, 'ACTIVE')", id);
        return id;
    }

    private AiUsageGuard guard() {
        AuralisProperties.Limits limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 4_096, 2, 32_000, 24, 524_288, 512, 16_777_216);
        return guard(limits);
    }

    private AiUsageGuard guard(AuralisProperties.Limits limits) {
        return new AiUsageGuard(jdbc, new DataSourceTransactionManager(dataSource), Clock.systemUTC(), limits);
    }
}
