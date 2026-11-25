package com.auralis.app.ai.usage;



import com.auralis.app.ai.AiProviderType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(OutputCaptureExtension.class)
class AiUsageGuardDiagnosticTests {
    private static final Instant NOW = Instant.parse("2026-10-10T10:00:00Z");

    @Test
    void separatesTaskCallAndTaskTokenRejectsWithoutAddingReservations(CapturedOutput output) throws Exception {
        Fixture calls = new Fixture(overviewTaskCallLimit());
        AiUsageGuard.TaskLease task = calls.guard.beginTask(calls.overviewContext());
        calls.guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "test-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 5, 0);
        int before = calls.reservations();
        assertCode(() -> calls.guard.reserve(task, AiStage.OVERVIEW_REDUCE, AiProviderType.DEEPSEEK,
                "https://host/path?secret", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 1, 0),
                "AI_TASK_BUDGET_EXCEEDED");
        assertThat(calls.reservations()).isEqualTo(before);

        Fixture tokens = new Fixture(limits(4, 3, 100, 200, 500, 10));
        AiUsageGuard.TaskLease tokenTask = tokens.guard.beginTask(tokens.context());
        assertCode(() -> tokens.guard.reserve(tokenTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "test-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 11, 0), "AI_TASK_BUDGET_EXCEEDED");
        assertThat(tokens.reservations()).isZero();

        assertThat(output.getOut()).contains("dimension=TASK_CALLS", "requested=1", "used=1",
                        "remaining=0", "limit=1", "dimension=TASK_TOKENS", "requested=11", "used=0",
                        "remaining=10", "limit=10")
                .contains("model=unknown")
                .doesNotContain("task-key-marker", "secret", "https://host/path");
        calls.close();
        tokens.close();
    }

    @Test
    void distinguishesUserAndGlobalConcurrency(CapturedOutput output) throws Exception {
        Fixture user = new Fixture(limits(4, 1, 100, 200, 500, 1_000));
        AiUsageGuard.TaskLease userA = user.guard.beginTask(user.context());
        AiUsageGuard.TaskLease userB = user.guard.beginTask(user.context("second"));
        user.guard.reserve(userA, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 1, 0);
        int before = user.reservations();
        assertCode(() -> user.guard.reserve(userB, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                "model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 1, 0), "AI_CONCURRENCY_LIMIT");
        assertThat(user.reservations()).isEqualTo(before);

        Fixture global = new Fixture(limits(1, 2, 100, 200, 500, 1_000));
        AiUsageGuard.TaskLease globalA = global.guard.beginTask(global.context());
        AiUsageGuard.TaskLease globalB = global.guard.beginTask(global.context(global.otherUser(), "other"));
        global.guard.reserve(globalA, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 1, 0);
        assertCode(() -> global.guard.reserve(globalB, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                "model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 1, 0), "AI_CONCURRENCY_LIMIT");

        assertThat(output.getOut()).contains("dimension=USER_CONCURRENCY", "dimension=GLOBAL_CONCURRENCY")
                .doesNotContain("task-key-marker", "https://", "api-key");
        user.close();
        global.close();
    }

    @Test
    void separatesHourlyDailyAndGlobalDailyQuotaRejects(CapturedOutput output) throws Exception {
        Fixture hourly = new Fixture(limits(4, 3, 10, 100, 200, 1_000));
        consume(hourly, 9);
        assertQuotaReject(hourly, "AI_HOURLY_QUOTA_EXCEEDED");

        Fixture daily = new Fixture(limits(4, 3, 100, 10, 200, 1_000));
        consume(daily, 9);
        assertQuotaReject(daily, "AI_DAILY_QUOTA_EXCEEDED");

        Fixture global = new Fixture(limits(4, 3, 100, 100, 10, 1_000));
        consume(global, 9);
        assertQuotaReject(global, "AI_GLOBAL_QUOTA_EXCEEDED");

        assertThat(output.getOut()).contains("dimension=USER_HOURLY", "dimension=USER_DAILY",
                        "dimension=GLOBAL_DAILY", "requested=2", "used=9")
                .doesNotContain("task-key-marker", "credential-marker", "https://");
        hourly.close();
        daily.close();
        global.close();
    }

    private void consume(Fixture fixture, long tokens) {
        AiUsageGuard.TaskLease task = fixture.guard.beginTask(fixture.context("consume"));
        AiUsageGuard.CallReservation call = fixture.guard.reserve(task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, tokens, 0);
        fixture.guard.markDispatched(task, call);
        fixture.guard.settle(task, call, new AiTokenUsage(tokens, 0L), true, null);
    }

    private void assertQuotaReject(Fixture fixture, String code) {
        AiUsageGuard.TaskLease task = fixture.guard.beginTask(fixture.context("reject"));
        assertCode(() -> fixture.guard.reserve(task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 2, 0), code);
        assertThat(fixture.reservations()).isEqualTo(1);
    }

    private void assertCode(Runnable action, String expected) {
        assertThatThrownBy(action::run).isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code()).isEqualTo(expected);
    }

    private static com.auralis.app.shared.config.AuralisProperties.Limits limits(
            int global, int user, long hourly, long daily, long system, long taskTokens) {
        return new com.auralis.app.shared.config.AuralisProperties.Limits(global, user, hourly, daily, system,
                60_000, 1_000, 4_096, taskTokens, 24, 524_288, 512, 16_777_216);
    }

    private static com.auralis.app.shared.config.AuralisProperties.Limits overviewTaskCallLimit() {
        return new com.auralis.app.shared.config.AuralisProperties.Limits(4, 3, 100, 200, 500,
                60_000, 1_000, 4_096, 1_000, 1, 1_000, 512, 16_777_216);
    }

    private static final class Fixture implements AutoCloseable {
        private final JdbcTemplate jdbc;
        private final AiUsageGuard guard;
        private final UUID user = UUID.randomUUID();
        private final UUID otherUser = UUID.randomUUID();

        private Fixture(com.auralis.app.shared.config.AuralisProperties.Limits limits) throws Exception {
            DriverManagerDataSource source = new DriverManagerDataSource(
                    "jdbc:h2:mem:diagnostic" + UUID.randomUUID().toString().replace("-", "")
                            + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
            jdbc = new JdbcTemplate(source);
            jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
            jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                    + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
            try (Connection connection = source.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
            }
            jdbc.update("insert into users(id) values (?)", user);
            jdbc.update("insert into users(id) values (?)", otherUser);
            guard = new AiUsageGuard(jdbc, new DataSourceTransactionManager(source), new FixedClock(), limits);
        }

        AiTaskContext context() { return context(user, "first"); }
        AiTaskContext context(String suffix) { return context(user, suffix); }
        AiTaskContext overviewContext() {
            return new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "task-key-marker-overview");
        }
        AiTaskContext context(UUID owner, String suffix) {
            return new AiTaskContext(owner, AiFeature.CHAT, "task-key-marker-" + suffix, UUID.randomUUID());
        }
        UUID otherUser() { return otherUser; }
        int reservations() { return jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class); }
        @Override public void close() { }
    }

    private static final class FixedClock extends Clock {
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return NOW; }
    }
}
