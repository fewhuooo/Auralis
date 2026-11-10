package com.auralis.app.ai.usage;



import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.List;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiUsageLedgerBehaviorTests {

    @Test
    void overviewLeavesUserCapacityForChatAcrossGuardInstancesAndBothOverviewFeatures() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        Clock clock = Clock.systemUTC();
        var policy = limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216);
        AiUsageGuard first = guard(db, clock, policy);
        AiUsageGuard second = guard(db, clock, policy);
        var source = first.beginTask(new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "source"));
        var subject = second.beginTask(new AiTaskContext(user, AiFeature.SUBJECT_OVERVIEW, "subject"));
        var chat = second.beginTask(new AiTaskContext(user, AiFeature.CHAT, "chat"));
        var reserved = first.reserve(source, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                "test", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 10, 10);
        assertThatThrownBy(() -> second.reserve(subject, AiStage.OVERVIEW_REDUCE, AiProviderType.DEEPSEEK,
                "test", AiCredentialSource.USER_SUPPLIED, AiOutputRole.FINAL, 10, 10))
                .isInstanceOf(AiUsageLimitException.class).hasMessage("AI_CONCURRENCY_LIMIT");
        second.reserve(chat, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                "test", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 10);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class))
                .isEqualTo(2);
        first.settle(source, reserved, null, false, "NOT_DISPATCHED");
        assertThat(second.reserve(subject, AiStage.OVERVIEW_REDUCE, AiProviderType.DEEPSEEK,
                "test", AiCredentialSource.PLATFORM, AiOutputRole.FINAL, 10, 10)).isNotNull();
    }

    @Test
    void singleUserSlotStillAllowsOverview() throws Exception {
        TestDb db = database();
        AiUsageGuard guard = guard(db, Clock.systemUTC(), limits(1, 1, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        var task = guard.beginTask(new AiTaskContext(db.user(), AiFeature.SOURCE_OVERVIEW, "single-slot"));
        assertThat(guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                "test", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 10, 10)).isNotNull();
    }

    @Test
    void reservesBudgetBeforeDispatchAndEnforcesTaskAndUserConcurrencyAcrossGuardInstances() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        AuralisProperties.Limits limits = limits(1, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216);
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard first = guard(db, clock, limits);
        AiUsageGuard second = guard(db, clock, limits);
        AiTaskContext firstContext = new AiTaskContext(user, AiFeature.CHAT, "message-1");
        AiUsageGuard.TaskLease task = first.beginTask(firstContext);
        assertThatThrownBy(() -> second.beginTask(firstContext))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_CONCURRENCY_LIMIT");

        AiUsageGuard.CallReservation reserved = first.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10_000, 4_096);
        AiTaskContext otherContext = new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "overview-1");
        AiUsageGuard.TaskLease otherTask = second.beginTask(otherContext);
        assertThatThrownBy(() -> second.reserve(
                otherTask, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "chat-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 1, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_CONCURRENCY_LIMIT");
        assertThat(db.jdbc().queryForObject("select request_dispatched from ai_usage_reservations where id=?",
                Boolean.class, reserved.id())).isFalse();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where state='RESERVED'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void enforcesPerUserConcurrencyWhileGlobalCapacityRemains() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 1, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease first = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "user-active-1"));
        AiUsageGuard.TaskLease second = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "user-active-2"));
        guard.reserve(first, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 0);

        assertThatThrownBy(() -> guard.reserve(second, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 10, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_CONCURRENCY_LIMIT");
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where state='RESERVED'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void accumulatesTaskTokensAcrossCallsAndRejectsCallsPastTheTaskLimit() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 100, 2, 24, 100, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "task-budget-overview"));
        AiUsageGuard.CallReservation first = guard.reserve(
                task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "overview-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 60, 0);
        guard.markDispatched(task, first);
        guard.settle(task, first, new AiTokenUsage(60L, 0L), true, null);

        assertThatThrownBy(() -> guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                "overview-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 41, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_TASK_BUDGET_EXCEEDED");
        AiUsageGuard.CallReservation second = guard.reserve(
                task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "overview-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 40, 0);
        guard.markDispatched(task, second);
        guard.settle(task, second, new AiTokenUsage(40L, 0L), true, null);

        assertThatThrownBy(() -> guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                "overview-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 1, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_TASK_BUDGET_EXCEEDED");
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where task_id=?",
                Integer.class, task.taskId())).isEqualTo(2);
    }

    @Test
    void exemptsEmbeddingStagesFromWindowQuotasAndSnapshotsWithoutRewritingHistory() throws Exception {
        TestDb db = database();
        UUID firstUser = db.user();
        UUID secondUser = db.user();
        UUID thirdUser = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard seedGuard = guard(db, clock, limits(4, 4, 10_000, 20_000, 50_000,
                300_000, 10_000, 5_000, 24, 24, 10_000, 512, 16_777_216));

        AiUsageGuard.TaskLease completedTask = seedGuard.beginTask(
                new AiTaskContext(firstUser, AiFeature.INGESTION, "legacy-completed-embedding"));
        AiUsageGuard.CallReservation completedEmbedding = seedGuard.reserve(completedTask,
                AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 100, 0);
        seedGuard.markDispatched(completedTask, completedEmbedding);
        seedGuard.settle(completedTask, completedEmbedding, new AiTokenUsage(80L, 0L), true, null);
        seedGuard.closeTask(completedTask);

        AiUsageGuard.TaskLease expiredTask = seedGuard.beginTask(
                new AiTaskContext(secondUser, AiFeature.INGESTION, "legacy-expired-embedding"));
        AiUsageGuard.CallReservation expiredEmbedding = seedGuard.reserve(expiredTask,
                AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 400, 0);
        seedGuard.markDispatched(expiredTask, expiredEmbedding);
        clock.advanceSeconds(301);
        seedGuard.closeTask(seedGuard.beginTask(
                new AiTaskContext(secondUser, AiFeature.CHAT, "expire-old-reservation")));

        for (UUID user : List.of(firstUser, secondUser)) {
            AiUsageGuard.TaskLease chat = seedGuard.beginTask(
                    new AiTaskContext(user, AiFeature.CHAT, "metered-chat-" + user));
            AiUsageGuard.CallReservation metered = seedGuard.reserve(chat, AiStage.CHAT_COMPLETION,
                    AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM,
                    AiOutputRole.GENERAL, 1_000, 0);
            seedGuard.markDispatched(chat, metered);
            seedGuard.settle(chat, metered, new AiTokenUsage(1_000L, 0L), true, null);
            seedGuard.closeTask(chat);
        }

        AiUsageGuard.TaskLease reservedTask = seedGuard.beginTask(
                new AiTaskContext(firstUser, AiFeature.CHAT, "legacy-reserved-embedding"));
        AiUsageGuard.CallReservation reservedEmbedding = seedGuard.reserve(reservedTask,
                AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 500, 0);
        AiUsageGuard.TaskLease metadataTask = seedGuard.beginTask(
                new AiTaskContext(secondUser, AiFeature.PROVIDER_SETUP, "legacy-provider-metadata"));
        AiUsageGuard.CallReservation metadata = seedGuard.reserve(metadataTask, AiStage.PROVIDER_METADATA,
                AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM,
                AiOutputRole.GENERAL, 0, 0);
        seedGuard.markDispatched(metadataTask, metadata);
        seedGuard.settle(metadataTask, metadata, new AiTokenUsage(0L, 0L), true, null);
        seedGuard.closeTask(metadataTask);

        AiUsageGuard quotaGuard = guard(db, clock, limits(4, 4, 1_000, 1_000, 2_000,
                300_000, 10_000, 5_000, 24, 24, 10_000, 512, 16_777_216));

        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, completedEmbedding.id())).isEqualTo("COMPLETED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, completedEmbedding.id())).isEqualTo(80);
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, expiredEmbedding.id())).isEqualTo("EXPIRED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, expiredEmbedding.id())).isEqualTo(400);
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, reservedEmbedding.id())).isEqualTo("RESERVED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, reservedEmbedding.id())).isZero();
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, metadata.id())).isEqualTo("COMPLETED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, metadata.id())).isZero();

        AiUsageGuard.TaskLease newIngestion = quotaGuard.beginTask(
                new AiTaskContext(firstUser, AiFeature.INGESTION, "new-ingestion-embedding"));
        AiUsageGuard.CallReservation ingestionEmbedding = quotaGuard.reserve(newIngestion,
                AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 100, 0);
        quotaGuard.markDispatched(newIngestion, ingestionEmbedding);
        quotaGuard.settle(newIngestion, ingestionEmbedding, new AiTokenUsage(80L, 0L), true, null);
        quotaGuard.closeTask(newIngestion);

        AiUsageGuard.TaskLease newRetrieval = quotaGuard.beginTask(
                new AiTaskContext(thirdUser, AiFeature.CHAT, "new-retrieval-embedding"));
        AiUsageGuard.CallReservation retrievalEmbedding = quotaGuard.reserve(newRetrieval,
                AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 100, 0);
        quotaGuard.markDispatched(newRetrieval, retrievalEmbedding);
        quotaGuard.settle(newRetrieval, retrievalEmbedding, new AiTokenUsage(80L, 0L), true, null);
        quotaGuard.closeTask(newRetrieval);
        AiUsageSnapshot firstBefore = quotaGuard.snapshotForUser(firstUser);
        AiUsageSnapshot secondBefore = quotaGuard.snapshotForUser(secondUser);
        assertThat(firstBefore.hourly().chargedTokens()).isEqualTo(1_000);
        assertThat(firstBefore.hourly().reservedTokens()).isZero();
        assertThat(firstBefore.hourly().remainingTokens()).isZero();
        assertThat(secondBefore.daily().chargedTokens()).isEqualTo(1_000);
        assertThat(secondBefore.daily().reservedTokens()).isZero();


        assertThat(quotaGuard.snapshotForUser(firstUser).hourly().chargedTokens()).isEqualTo(1_000);
        assertThat(quotaGuard.snapshotForUser(firstUser).hourly().reservedTokens()).isZero();
        assertThat(quotaGuard.snapshotForUser(thirdUser).daily().chargedTokens()).isZero();
        assertThat(quotaGuard.snapshotForUser(thirdUser).daily().reservedTokens()).isZero();
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, ingestionEmbedding.id())).isEqualTo(80);
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, retrievalEmbedding.id())).isEqualTo(80);

        AiUsageGuard.TaskLease meteredTask = quotaGuard.beginTask(
                new AiTaskContext(thirdUser, AiFeature.CHAT, "metered-chat-still-limited"));
        assertThatThrownBy(() -> quotaGuard.reserve(meteredTask, AiStage.CHAT_COMPLETION,
                AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM,
                AiOutputRole.GENERAL, 1, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_GLOBAL_QUOTA_EXCEEDED");
    }

    @Test
    void embeddingReservationsRemainConcurrencyBoundAndCancelOrExpireSafely() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 1, 100, 200, 200,
                60_000, 10_000, 5_000, 24, 24, 10_000, 512, 16_777_216));
        AiTaskContext firstContext = new AiTaskContext(user, AiFeature.INGESTION, "embedding-concurrency");
        AiUsageGuard.TaskLease firstTask = guard.beginTask(firstContext);
        AiUsageGuard.CallReservation first = guard.reserve(firstTask, AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 50, 0);
        AiUsageGuard.TaskLease secondTask = guard.beginTask(
                new AiTaskContext(user, AiFeature.CHAT, "other-active-request"));
        assertThatThrownBy(() -> guard.reserve(secondTask, AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 1, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_CONCURRENCY_LIMIT");

        guard.settle(firstTask, first, null, false, "cancelled-before-dispatch");
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, first.id())).isEqualTo("RELEASED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, first.id())).isZero();

        AiUsageGuard.CallReservation undispatched = guard.reserve(firstTask, AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 60, 0);
        clock.advanceSeconds(61);
        assertThat(guard.snapshotForUser(user).hourly().reservedTokens()).isZero();
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, undispatched.id())).isEqualTo("EXPIRED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, undispatched.id())).isZero();

        AiUsageGuard.TaskLease retryTask = guard.beginTask(firstContext);
        AiUsageGuard.CallReservation dispatched = guard.reserve(retryTask, AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 70, 0);
        guard.markDispatched(retryTask, dispatched);
        clock.advanceSeconds(61);
        AiUsageGuard.TaskLease reclaimed = guard.beginTask(firstContext);
        assertThat(reclaimed.taskId()).isEqualTo(retryTask.taskId());
        assertThat(reclaimed.ownerId()).isNotEqualTo(retryTask.ownerId());
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, dispatched.id())).isEqualTo("EXPIRED");
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, dispatched.id())).isEqualTo(70);
        assertThat(guard.snapshotForUser(user).hourly().chargedTokens()).isZero();
    }
    @Test
    void enforcesDailyQuotaAndResetsAtUtcMidnight() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T23:59:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100, 50, 100,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "utc-daily-overview"));
        AiUsageGuard.CallReservation first = guard.reserve(
                task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "overview-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 40, 0);
        guard.markDispatched(task, first);
        guard.settle(task, first, new AiTokenUsage(40L, 0L), true, null);

        assertThatThrownBy(() -> guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                "overview-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 11, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_DAILY_QUOTA_EXCEEDED");
        clock.set(Instant.parse("2026-10-11T00:00:01Z"));
        AiUsageGuard.CallReservation nextDay = guard.reserve(
                task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "overview-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 40, 0);
        guard.markDispatched(task, nextDay);
        guard.settle(task, nextDay, new AiTokenUsage(40L, 0L), true, null);

        AiUsageSnapshot snapshot = guard.snapshotForUser(user);
        assertThat(snapshot.daily().chargedTokens()).isEqualTo(40);
        assertThat(snapshot.daily().resetAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00Z"));
    }

    @Test
    void ingestionBudgetSurvivesClosedScopeContinuationForStableJobKey() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 100));
        AiTaskContext context = new AiTaskContext(user, AiFeature.INGESTION, "job-generation-7");
        AiUsageGuard.TaskLease firstScope = guard.beginTask(context);
        AiUsageGuard.CallReservation first = guard.reserve(firstScope, AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 60, 0);
        guard.markDispatched(firstScope, first);
        guard.settle(firstScope, first, new AiTokenUsage(60L, 0L), true, null);
        guard.closeTask(firstScope);

        AiUsageGuard.TaskLease continuedScope = guard.beginTask(context);
        assertThat(continuedScope.taskId()).isEqualTo(firstScope.taskId());
        assertThatThrownBy(() -> guard.reserve(continuedScope, AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 41, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_TASK_BUDGET_EXCEEDED");
        AiUsageGuard.CallReservation continued = guard.reserve(continuedScope, AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW, "embedding-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 40, 0);
        assertThat(continued.taskId()).isEqualTo(first.taskId());
    }

    @Test
    void refusesNewScopesAndReservationsAfterAccountIsDisabled() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiTaskContext originalContext = new AiTaskContext(user, AiFeature.CHAT, "before-disable");
        AiUsageGuard.TaskLease existing = guard.beginTask(originalContext);
        db.jdbc().update("update users set status='DISABLED' where id=?", user);

        assertThatThrownBy(() -> guard.beginTask(
                new AiTaskContext(user, AiFeature.CHAT, "after-disable")))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("UNAUTHENTICATED");
        assertThatThrownBy(() -> guard.reserve(existing, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 10, 0))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void settlementIsIdempotentAndMissingUsageUsesTheConservativeReservation() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "message-2"));
        AiUsageGuard.CallReservation call = guard.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 120, 4096);
        guard.markDispatched(task, call);

        AiProviderUsage first = guard.settle(task, call, null, false, "MODEL_PROVIDER_ERROR");
        AiProviderUsage repeated = guard.settle(task, call, new AiTokenUsage(2L, 3L), true, null);

        assertThat(first.chargedTokens()).isEqualTo(4_216L);
        assertThat(first.providerUsageComplete()).isFalse();
        assertThat(repeated.chargedTokens()).isEqualTo(first.chargedTokens());
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, call.id())).isEqualTo(4_216L);
    }

    @Test
    void appliesUtcHourlyAndDailyWindowsAndReturnsOnlyUserWindowTotals() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:59:59Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100, 200, 2_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "message-3"));
        AiUsageGuard.CallReservation call = guard.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 40, 0);
        AiUsageSnapshot inFlight = guard.snapshotForUser(user);
        assertThat(inFlight.hourly().reservedTokens()).isEqualTo(40);
        assertThat(inFlight.hourly().remainingTokens()).isEqualTo(60);
        guard.markDispatched(task, call);
        guard.settle(task, call, new AiTokenUsage(20L, 10L), true, null);

        AiUsageSnapshot beforeBoundary = guard.snapshotForUser(user);
        assertThat(beforeBoundary.hourly().chargedTokens()).isEqualTo(30);
        clock.set(Instant.parse("2026-10-10T11:00:00Z"));
        AiUsageSnapshot afterBoundary = guard.snapshotForUser(user);
        assertThat(afterBoundary.hourly().chargedTokens()).isZero();
        assertThat(afterBoundary.daily().chargedTokens()).isEqualTo(30);
        assertThat(afterBoundary.hourly().resetAt()).isEqualTo(Instant.parse("2026-10-10T12:00:00Z"));
    }

    @Test
    void includesSubMicrosecondReservationInQuotaAndSnapshotAtPersistedTimestampPrecision() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00.123456789Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100, 200, 2_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "fractional-overview"));
        guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "overview-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 40, 0);

        assertThat(guard.snapshotForUser(user).hourly().reservedTokens()).isEqualTo(40);
        assertThatThrownBy(() -> guard.reserve(
                task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, "overview-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 61, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_HOURLY_QUOTA_EXCEEDED");
    }

    @Test
    void countsReservationFromAnotherClockWithinTheSameUtcWindow() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock aheadClock = new MutableClock(Instant.parse("2026-10-10T10:05:00Z"));
        MutableClock localClock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(4, 2, 100, 200, 2_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216);
        AiUsageGuard ahead = guard(db, aheadClock, limits);
        AiUsageGuard local = guard(db, localClock, limits);
        AiUsageGuard.TaskLease aheadTask = ahead.beginTask(
                new AiTaskContext(user, AiFeature.CHAT, "ahead-clock"));
        ahead.reserve(aheadTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 40, 0);
        AiUsageGuard.TaskLease localTask = local.beginTask(
                new AiTaskContext(user, AiFeature.CHAT, "local-clock"));

        assertThat(local.snapshotForUser(user).hourly().reservedTokens()).isEqualTo(40);
        assertThatThrownBy(() -> local.reserve(
                localTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model",
                AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 61, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_HOURLY_QUOTA_EXCEEDED");
    }

    @Test
    void expiresUndispatchedReservationWithoutChargingIt() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                60_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(new AiTaskContext(user, AiFeature.CHAT, "not-dispatched"));
        AiUsageGuard.CallReservation call = guard.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 100, 500);
        clock.advanceSeconds(61);

        AiUsageSnapshot snapshot = guard.snapshotForUser(user);
        assertThat(snapshot.hourly().chargedTokens()).isZero();
        assertThat(snapshot.hourly().reservedTokens()).isZero();
        assertThat(db.jdbc().queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, call.id())).isZero();
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, call.id())).isEqualTo("EXPIRED");
    }

    @Test
    void platformBudgetSnapshotMatchesAdmissionCallsWhileAuditStillCountsReleasedRows() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "adaptive-budget-accounting"));

        AiUsageGuard.CallReservation released = guard.reserve(task, AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                "overview-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 10, 20);
        guard.settle(task, released, null, false, "MODEL_PROVIDER_ERROR");
        AiUsageGuard.CallReservation dispatched = guard.reserve(task, AiStage.OVERVIEW_REDUCE,
                AiProviderType.DEEPSEEK, "overview-model", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 10, 20);
        guard.markDispatched(task, dispatched);
        guard.settle(task, dispatched, new AiTokenUsage(8L, 12L), true, null);

        AiPlatformTaskBudgetUsage budget = guard.platformTaskBudgetUsage(task);
        AiTaskUsageSnapshot audit = guard.taskUsageForOwner(user, task.taskId(),
                java.util.Set.of(AiOperationKind.SOURCE_OVERVIEW));

        assertThat(budget.calls()).isEqualTo(1);
        assertThat(budget.chargedTokens()).isEqualTo(20);
        assertThat(budget.reservedTokens()).isZero();
        assertThat(audit.groups().get("SOURCE_OVERVIEW:PLATFORM").calls()).isEqualTo(2);
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, released.id())).isEqualTo("RELEASED");
        assertThat(db.jdbc().queryForObject("select request_dispatched from ai_usage_reservations where id=?",
                Boolean.class, dispatched.id())).isTrue();
    }

    @Test
    void keepsGlobalDailyQuotaAfterDeletingTheUserWhoWasCharged() throws Exception {
        TestDb db = database();
        UUID firstUser = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(4, 2, 100, 200, 50,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216);
        AiUsageGuard guard = guard(db, clock, limits);
        AiUsageGuard.TaskLease task = guard.beginTask(
                new AiTaskContext(firstUser, AiFeature.CHAT, "deleted-user-charge"));
        AiUsageGuard.CallReservation call = guard.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 20, 30);
        guard.markDispatched(task, call);
        guard.settle(task, call, new AiTokenUsage(18L, 30L), true, null);

        db.jdbc().update("delete from users where id=?", firstUser);
        UUID secondUser = db.user();
        AiUsageGuard.TaskLease secondTask = guard.beginTask(
                new AiTaskContext(secondUser, AiFeature.CHAT, "new-user-after-deletion"));

        assertThatThrownBy(() -> guard.reserve(secondTask, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 3, 0))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_GLOBAL_QUOTA_EXCEEDED");
        assertThat(db.jdbc().queryForObject("select sum(charged_tokens) from ai_usage_reservations",
                Long.class)).isEqualTo(48L);
    }

    @Test
    void heartbeatAfterSuccessfulSettlementDoesNotMarkTaskLost() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                300_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiUsageGuard.TaskLease task = guard.beginTask(
                new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "heartbeat-after-settle"));
        AiUsageGuard.CallReservation call = guard.reserve(task, AiStage.OVERVIEW_REDUCE, AiProviderType.DEEPSEEK, "overview-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 100, 200);
        guard.markDispatched(task, call);

        AiUsageGuard.SettlementResult settled = guard.settleSuccessful(
                task, call, new AiTokenUsage(80L, 120L));
        Instant settledCallLease = db.jdbc().queryForObject(
                "select lease_until from ai_usage_reservations where id=?", java.time.OffsetDateTime.class,
                call.id()).toInstant();

        assertThat(settled.accepted()).isTrue();
        clock.advanceSeconds(290);
        assertThat(guard.heartbeat(task, call.id()))
                .as("heartbeat that captured the call before settlement must renew the task, not lose it")
                .isTrue();
        assertThat(db.jdbc().queryForObject("select lease_until from ai_usage_reservations where id=?",
                java.time.OffsetDateTime.class, call.id()).toInstant()).isEqualTo(settledCallLease);
        clock.advanceSeconds(20);
        assertThat(guard.reserve(task, AiStage.OVERVIEW_REDUCE, AiProviderType.DEEPSEEK, "overview-model", AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 100, 200)).isNotNull();
    }

    @Test
    void expiresAnUnknownDispatchOnceAndDoesNotAllowExpiredLeaseRenewal() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AiUsageGuard guard = guard(db, clock, limits(4, 2, 100_000, 200_000, 2_000_000,
                60_000, 10_000, 32_000, 2, 24, 524_288, 512, 16_777_216));
        AiTaskContext context = new AiTaskContext(user, AiFeature.CHAT, "message-4");
        AiUsageGuard.TaskLease task = guard.beginTask(context);
        AiUsageGuard.CallReservation call = guard.reserve(
                task, AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, "chat-model", AiCredentialSource.PLATFORM, AiOutputRole.GENERAL, 100, 500);
        guard.markDispatched(task, call);
        clock.advanceSeconds(61);

        assertThat(guard.heartbeat(task, call.id())).isFalse();
        AiUsageGuard.TaskLease retry = guard.beginTask(context);
        AiProviderUsage late = guard.settle(task, call, null, false, "late");
        AiProviderUsage duplicate = guard.settle(task, call, new AiTokenUsage(1L, 1L), true, null);

        assertThat(retry.taskId()).isNotEqualTo(task.taskId());
        assertThat(late.chargedTokens()).isEqualTo(600);
        assertThat(duplicate.chargedTokens()).isEqualTo(600);
        assertThat(db.jdbc().queryForObject("select state from ai_usage_reservations where id=?",
                String.class, call.id())).isEqualTo("EXPIRED");
    }

    private TestDb database() throws Exception {
        DriverManagerDataSource source = new DriverManagerDataSource(
                "jdbc:h2:mem:aiusage" + UUID.randomUUID().toString().replace("-", "")
                        + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(source);
        jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
        jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
        try (Connection connection = source.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
        }
        return new TestDb(source, jdbc);
    }

    private AiUsageGuard guard(TestDb db, Clock clock, AuralisProperties.Limits limits) {
        return new AiUsageGuard(db.jdbc(), new DataSourceTransactionManager(db.source()), clock, limits);
    }

    private AuralisProperties.Limits limits(int globalConcurrent, int perUserConcurrent,
                                             long hourly, long daily, long globalDaily,
                                             long leaseMillis, long heartbeatMillis,
                                             int chatCalls, int chatMaxCalls,
                                             int overviewMaxCalls, long overviewTokens,
                                             int ingestionMaxCalls, long ingestionTokens) {
        return new AuralisProperties.Limits(globalConcurrent, perUserConcurrent, hourly, daily, globalDaily,
                leaseMillis, heartbeatMillis, 4096, chatMaxCalls, chatCalls,
                overviewMaxCalls, overviewTokens, ingestionMaxCalls, ingestionTokens);
    }

    private record TestDb(DataSource source, JdbcTemplate jdbc) {
        UUID user() {
            UUID id = UUID.randomUUID();
            jdbc.update("insert into users(id) values (?)", id);
            return id;
        }
    }

    private static final class MutableClock extends Clock {
        private final AtomicReference<Instant> instant;

        MutableClock(Instant initial) { instant = new AtomicReference<>(initial); }
        void set(Instant value) { instant.set(value); }
        void advanceSeconds(long seconds) { instant.updateAndGet(value -> value.plusSeconds(seconds)); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant.get(); }
    }
}
