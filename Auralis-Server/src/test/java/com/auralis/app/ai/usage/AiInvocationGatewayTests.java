package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.internal.provider.SiliconFlowEmbeddingProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.config.AuralisProperties;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Connection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiInvocationGatewayTests {

    @Test
    void overviewBudgetTaskIdPersistsCallLimitAcrossFailedGenerationRetry() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits base = limits(100_000, 200_000);
        AuralisProperties.Limits oneOverviewCall = new AuralisProperties.Limits(
                base.globalConcurrent(), base.perUserConcurrent(), base.perUserHourlyTokens(),
                base.perUserDailyTokens(), base.globalDailyTokens(), base.reservationLeaseMillis(),
                base.heartbeatMillis(), base.chatMaxOutputTokens(), base.chatMaxCalls(), base.chatTaskTokens(),
                1, base.overviewTaskTokens(), base.ingestionMaxCalls(), base.ingestionTaskTokens());
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, oneOverviewCall);
        AiInvocationGateway gateway = gateway(guard, provider, clock, oneOverviewCall, heartbeat, db.transactions());
        UUID budgetTaskId = UUID.randomUUID();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "logical-input-generation", budgetTaskId);

        try (AiTaskScope firstAttempt = gateway.beginTask(context)) {
            firstAttempt.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, request(),
                    new AiCredential("https://provider.test/v1", "synthetic-test-key"), 1_000);
        }
        try (AiTaskScope retry = gateway.beginTask(context)) {
            assertThatThrownBy(() -> retry.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                    request(), new AiCredential("https://other-provider.test/v1", "different-profile-key"), 1_000))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_TASK_BUDGET_EXCEEDED");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select count(distinct task_id) from ai_usage_reservations", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void overviewUsageSummaryAggregatesFailedAttemptAndSuccessfulRetryWithoutHidingUnknownDispatch() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "retry-usage-summary", UUID.randomUUID());
        AtomicInteger attempt = new AtomicInteger();
        provider.beforeComplete = () -> {
            if (attempt.getAndIncrement() == 0) throw new IllegalStateException("synthetic provider disconnect");
        };
        AiProviderUsage failedUsage;
        AiProviderUsage successfulUsage;
        try {
            try (AiTaskScope failed = gateway.beginTask(context)) {
                assertThatThrownBy(() -> failed.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                        request(), new AiCredential("https://provider.test/v1", "synthetic-test-key"), 1_000))
                        .isInstanceOf(IllegalStateException.class);
                failedUsage = failed.usage();
            }
            try (AiTaskScope retry = gateway.beginTask(context)) {
                retry.complete(AiStage.OVERVIEW_REDUCE, AiProviderType.DEEPSEEK, request(),
                        new AiCredential("https://provider.test/v1", "synthetic-test-key"), 1_000);
                successfulUsage = retry.usage();
            }
        } finally {
            heartbeat.shutdownNow();
        }

        OverviewTaskUsageSummary summary = gateway.overviewTaskUsage(context);
        assertThat(summary.estimatedInputTokens()).isEqualTo(
                failedUsage.estimatedInputTokens() + successfulUsage.estimatedInputTokens());
        assertThat(summary.reservedOutputTokens()).isEqualTo(
                failedUsage.reservedOutputTokens() + successfulUsage.reservedOutputTokens());
        assertThat(summary.chargedTokens()).isEqualTo(failedUsage.chargedTokens() + successfulUsage.chargedTokens());
        assertThat(summary.actualInputTokens()).isNull();
        assertThat(summary.actualOutputTokens()).isNull();
        assertThat(summary.unknownDispatchedCalls()).isEqualTo(1);
        assertThat(summary.activeDispatchedReservations()).isZero();
        assertThat(summary.providerUsageComplete()).isFalse();
    }

    @Test
    void stableOverviewBudgetIdsAreNamespacedByOwnerAndFeature() throws Exception {
        TestDb db = database();
        UUID firstUser = db.user();
        UUID secondUser = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits base = limits(100_000, 200_000);
        AuralisProperties.Limits oneOverviewCall = new AuralisProperties.Limits(
                base.globalConcurrent(), base.perUserConcurrent(), base.perUserHourlyTokens(),
                base.perUserDailyTokens(), base.globalDailyTokens(), base.reservationLeaseMillis(),
                base.heartbeatMillis(), base.chatMaxOutputTokens(), base.chatMaxCalls(), base.chatTaskTokens(),
                1, base.overviewTaskTokens(), base.ingestionMaxCalls(), base.ingestionTaskTokens());
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, oneOverviewCall);
        AiInvocationGateway gateway = gateway(guard, provider, clock, oneOverviewCall, heartbeat, db.transactions());
        UUID sharedBudgetId = UUID.randomUUID();
        AiTaskContext firstOwnerSource = new AiTaskContext(firstUser, AiFeature.SOURCE_OVERVIEW,
                "same-stable-id", sharedBudgetId);
        AiTaskContext secondOwnerSource = new AiTaskContext(secondUser, AiFeature.SOURCE_OVERVIEW,
                "same-stable-id", sharedBudgetId);
        AiTaskContext firstOwnerSubject = new AiTaskContext(firstUser, AiFeature.SUBJECT_OVERVIEW,
                "same-stable-id", sharedBudgetId);
        try {
            for (AiTaskContext context : List.of(firstOwnerSource, secondOwnerSource, firstOwnerSubject)) {
                try (AiTaskScope scope = gateway.beginTask(context)) {
                    scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, request(),
                            new AiCredential("https://provider.test/v1", "synthetic-test-key"), 1_000);
                }
            }
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(db.jdbc().queryForObject("select count(distinct task_id) from ai_usage_reservations", Integer.class))
                .isEqualTo(3);
        assertThat(gateway.overviewTaskUsage(firstOwnerSource).chargedTokens()).isGreaterThan(0);
        assertThat(gateway.overviewTaskUsage(secondOwnerSource).chargedTokens()).isGreaterThan(0);
        assertThat(gateway.overviewTaskUsage(firstOwnerSubject).chargedTokens()).isGreaterThan(0);
    }

    @Test
    void stableBudgetTaskIdsAreRejectedForNonOverviewFeatures() throws Exception {
        TestDb db = database();
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(),
                Clock.systemUTC(), limits(100_000, 200_000));
        AiTaskContext chat = new AiTaskContext(db.user(), AiFeature.CHAT, "chat-stable-budget", UUID.randomUUID());
        assertThatThrownBy(() -> guard.beginTask(chat)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void acceptsOverview6144ButRejects6145BeforeReservationOrProviderDispatch() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-test-key");
        AiProviderRequest accepted = requestWithOutput(6_144);
        AiProviderRequest excessive = requestWithOutput(6_145);

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW, "subject-final-6144"))) {
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, accepted, credential, 1_000);
        }
        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "source-over-6144"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                    excessive, credential, 1_000))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_REQUEST_BUDGET_EXCEEDED");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(1);
    }

    @Test
    void preservesChat4096OutputLimit() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000,
                2_000_000, 60_000, 1_000, 4_096, 2, 32_000, 24, 524_288, 512, 16_777_216);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-test-key");

        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.CHAT, "chat-4096"))) {
            scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, requestWithOutput(4_096),
                    credential, 1_000);
        }
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.CHAT, "chat-4097"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    requestWithOutput(4_097), credential, 1_000))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_REQUEST_BUDGET_EXCEEDED");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(1);
    }

    @Test
    void persistsUsageAndRejectsOverQuotaBeforeSecondProviderDispatch() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(10, 20);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiTaskContext firstContext = new AiTaskContext(userId, AiFeature.CHAT, "first-message");
        AiTaskContext secondContext = new AiTaskContext(userId, AiFeature.CHAT, "second-message");
        AiProviderRequest request = request();

        try (AiTaskScope first = gateway.beginTask(firstContext)) {
            AiInvocationResult<AiProviderResponse> result = first.complete(
                    AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, request,
                    new AiCredential("https://provider.test/v1", "test-key"), 1_000);
            assertThat(result.usage().chargedTokens()).isEqualTo(8);
            assertThat(result.usage().providerUsageComplete()).isTrue();
        }

        assertThatThrownBy(() -> {
            try (AiTaskScope second = gateway.beginTask(secondContext)) {
                second.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK, request,
                        new AiCredential("https://provider.test/v1", "test-key"), 1_000);
            }
        }).isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_HOURLY_QUOTA_EXCEEDED");

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select sum(charged_tokens) from ai_usage_reservations", Long.class))
                .isEqualTo(8L);
        heartbeat.shutdownNow();
    }

    @Test
    void doesNotDispatchAfterAccountIsDisabledBetweenReservationAndDispatch() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits) {
            @Override
            public void markDispatched(TaskLease task, CallReservation call) {
                db.jdbc().update("update users set status='DISABLED' where id=?", userId);
                super.markDispatched(task, call);
            }
        };
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());

        try (AiTaskScope task = gateway.beginTask(new AiTaskContext(userId, AiFeature.CHAT, "disable-before-dispatch"))) {
            assertThatThrownBy(() -> task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), 1_000))
                    .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                    .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                    .isEqualTo("UNAUTHENTICATED");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isZero();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations "
                + "where request_dispatched=false and state='RELEASED' and charged_tokens=0", Integer.class)).isEqualTo(1);
    }

    @Test
    void cancellationPropagationKeepsConservativeSettlementAndReleasesTaskLease() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "cancelled-overview"));
        OverviewCancellation cancellation = new OverviewCancellation();
        cancellation.cancel(OverviewCancellation.Reason.DEADLINE);

        try {
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), 1_000, cancellation))
                    .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                    .extracting(failure -> ((com.auralis.app.shared.error.DomainException) failure).code())
                    .isEqualTo("MODEL_TIMEOUT");
        } finally {
            scope.close();
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isZero();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations "
                + "where state='FAILED' and charged_tokens > 0", Integer.class)).isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_locks "
                + "where scope_key like 'TASK:%' and owner_id is not null", Integer.class)).isZero();
    }

    @Test
    void doesNotAcceptProviderSuccessAfterAnotherExecutionTakesOverExpiredTask() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "same-message");
        provider.beforeComplete = () -> {
            clock.advanceSeconds(61);
            try (AiTaskScope replacement = gateway.beginTask(context)) {
                // Taking the same stable task key proves the old execution lost ownership.
            }
        };

        try (AiTaskScope task = gateway.beginTask(context)) {
            assertThatThrownBy(() -> task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), 1_000))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_CONCURRENCY_LIMIT");
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where state='EXPIRED'",
                Integer.class)).isEqualTo(1);
        heartbeat.shutdownNow();
    }

    @Test
    void heartbeatsTaskAndActiveReservationDuringLongProviderCall() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "heartbeat-message");
        CountDownLatch providerStarted = new CountDownLatch(1);
        CountDownLatch providerContinue = new CountDownLatch(1);
        provider.beforeComplete = () -> {
            providerStarted.countDown();
            try {
                if (!providerContinue.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test provider was not released");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            }
        };
        AiTaskScope scope = gateway.beginTask(context);
        var caller = Executors.newSingleThreadExecutor();
        try {
            var result = caller.submit(() -> scope.complete(AiStage.CHAT_COMPLETION,
                    AiProviderType.DEEPSEEK, request(),
                    new AiCredential("https://provider.test/v1", "test-key"), 1_000));
            assertThat(providerStarted.await(2, TimeUnit.SECONDS)).isTrue();
            clock.advanceSeconds(59);
            Thread.sleep(1_200);
            clock.advanceSeconds(10);

            assertThatThrownBy(() -> gateway.beginTask(context))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_CONCURRENCY_LIMIT");
            assertThat(db.jdbc().queryForObject("select lease_until > ? from ai_usage_locks where scope_key like 'TASK:%'",
                    Boolean.class, clock.instant())).isTrue();

            providerContinue.countDown();
            assertThat(result.get(2, TimeUnit.SECONDS).usage().providerUsageComplete()).isTrue();
        } finally {
            providerContinue.countDown();
            scope.close();
            caller.shutdownNow();
            heartbeat.shutdownNow();
        }
    }

    @Test
    void streamsAndEmbedsWithoutHoldingDatabaseTransactions() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        TestEmbeddingProvider embeddingProvider = new TestEmbeddingProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(provider)),
                new EmbeddingProviderRegistry(List.of(embeddingProvider)),
                ai(limits), heartbeat, db.transactions());
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "stream-and-embed");
        List<String> streamed = new ArrayList<>();

        try (AiTaskScope scope = gateway.beginTask(context)) {
            assertThat(scope.stream(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    request(), new AiCredential("https://provider.test/v1", "test-key"),
                    chunk -> streamed.add(chunk.content())).usage().providerUsageComplete()).isTrue();
            assertThat(streamed).containsExactly("streamed");
            assertThat(scope.embed(AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW,
                    "embedding-model", List.of("text"),
                    new AiCredential("https://provider.test/v1", "test-key"))
                    .usage().providerUsageComplete()).isTrue();
        }
        heartbeat.shutdownNow();
    }

    @Test
    void chargesSiliconFlowReportedEmbeddingUsageThroughGatewayAndLedger() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        URI baseUri = URI.create("https://embedding.test/v1");
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "embedding.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.SILICONFLOW, baseUri)).thenReturn(endpoint);
        String vector = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
        String response = "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                + "\"usage\":{\"prompt_tokens\":7454,\"completion_tokens\":0,\"total_tokens\":7454}}";
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> response.getBytes(StandardCharsets.UTF_8);
        SiliconFlowEmbeddingProvider embeddingProvider = new SiliconFlowEmbeddingProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 100_000));
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(new TestProvider())),
                new EmbeddingProviderRegistry(List.of(embeddingProvider)),
                ai(limits), heartbeat, db.transactions());

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.INGESTION, "controlled-embedding-usage"))) {
            var result = scope.embed(AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW,
                    "BAAI/bge-m3", List.of("x".repeat(31_487)),
                    new AiCredential(baseUri.toString(), "synthetic-key", "BAAI/bge-m3"));

            assertThat(result.usage().providerUsageComplete()).isTrue();
            assertThat(result.usage().chargedTokens()).isEqualTo(7_454L);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(db.jdbc().queryForObject(
                "select actual_input_tokens from ai_usage_reservations", Long.class)).isEqualTo(7_454L);
        assertThat(db.jdbc().queryForObject(
                "select actual_output_tokens from ai_usage_reservations", Long.class)).isZero();
        assertThat(db.jdbc().queryForObject(
                "select charged_tokens from ai_usage_reservations", Long.class)).isEqualTo(7_454L);
    }

    @Test
    void rejectsSuccessWhenTaskIsTakenOverAfterOwnershipReadButBeforeSettlement() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "settlement-race");
        AtomicReference<AiInvocationGateway> gatewayRef = new AtomicReference<>();
        AtomicBoolean takeover = new AtomicBoolean(false);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits) {
            private void takeOverAfterLeaseExpires() {
                if (takeover.compareAndSet(false, true)) {
                    clock.advanceSeconds(61);
                    try (AiTaskScope replacement = gatewayRef.get().beginTask(context)) {
                        // Force a takeover after the successful provider call, before settlement.
                    }
                }
            }

            @Override
            public boolean isCurrent(TaskLease task, CallReservation call) {
                boolean current = super.isCurrent(task, call);
                if (current) takeOverAfterLeaseExpires();
                return current;
            }

            @Override
            public SettlementResult settleSuccessful(TaskLease task, CallReservation call, AiTokenUsage usage) {
                takeOverAfterLeaseExpires();
                return super.settleSuccessful(task, call, usage);
            }
        };
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        gatewayRef.set(gateway);

        try (AiTaskScope task = gateway.beginTask(context)) {
            assertThatThrownBy(() -> task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), 1_000))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_CONCURRENCY_LIMIT");
        }

        assertThat(takeover.get()).isTrue();
        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(db.jdbc().queryForObject(
                "select state from ai_usage_reservations where request_dispatched=true", String.class))
                .isEqualTo("EXPIRED");
        heartbeat.shutdownNow();
    }

    private AiInvocationGateway gateway(AiUsageGuard guard, TestProvider provider, Clock clock,
                                       AuralisProperties.Limits limits, ScheduledExecutorService heartbeat,
                                       DataSourceTransactionManager transactions) {
        return new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(provider)),
                new EmbeddingProviderRegistry(List.of(new TestEmbeddingProvider())),
                ai(limits), heartbeat, transactions);
    }

    private AuralisProperties.Ai ai(AuralisProperties.Limits limits) {
        return new AuralisProperties.Ai(false, "", "DEEPSEEK", new AuralisProperties.Defaults(null, null, null),
                3_000, 10_000, 120_000, 240_000, 12_000, 8, 5_242_880,
                32, 32_768, 3_000, 10_000, 3, 1_048_576, List.of(), false,
                1_000, 60_000, 3, limits);
    }

    private AuralisProperties.Limits limits(long hourly, long daily) {
        return new AuralisProperties.Limits(4, 2, hourly, daily, 2_000_000,
                60_000, 1_000, 16, 2, 32_000, 24, 524_288, 512, 16_777_216);
    }

    private AiProviderRequest request() {
        return new AiProviderRequest("test-model",
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, "x")), 0.0, 1);
    }

    private AiProviderRequest requestWithOutput(int maxTokens) {
        return new AiProviderRequest("test-model",
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, "x")), 0.0, maxTokens);
    }

    private TestDb database() throws Exception {
        DriverManagerDataSource source = new DriverManagerDataSource(
                "jdbc:h2:mem:gateway" + UUID.randomUUID().toString().replace("-", "")
                        + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(source);
        jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
        jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
        try (Connection connection = source.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
        }
        return new TestDb(source, jdbc, new DataSourceTransactionManager(source));
    }

    private record TestDb(DriverManagerDataSource source, JdbcTemplate jdbc,
                          DataSourceTransactionManager transactions) {
        UUID user() {
            UUID id = UUID.randomUUID();
            jdbc.update("insert into users(id) values (?)", id);
            return id;
        }
    }

    private static final class TestProvider implements AiProviderPort {
        private final AtomicInteger calls = new AtomicInteger();
        private volatile Runnable beforeComplete = () -> { };

        @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return complete(request, credential, 0);
        }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                    long timeoutMillis) {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            calls.incrementAndGet();
            beforeComplete.run();
            return new AiProviderResponse("ok", 4L, 4L, "stop");
        }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                long timeoutMillis, OverviewCancellation cancellation) {
            if (cancellation != null && cancellation.isCancelled()) {
                throw new com.auralis.app.shared.error.DomainException("MODEL_TIMEOUT", "provider call cancelled");
            }
            return complete(request, credential, timeoutMillis);
        }
        @Override public void streamInto(AiProviderRequest request, AiCredential credential,
                                        java.util.function.Consumer<com.auralis.app.ai.AiProviderChunk> sink) {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            sink.accept(new com.auralis.app.ai.AiProviderChunk("streamed", true,
                    new AiTokenUsage(4L, 4L)));
        }
        int completeCalls() { return calls.get(); }
    }

    private static final class TestEmbeddingProvider implements EmbeddingProviderPort {
        @Override public AiProviderType type() { return AiProviderType.SILICONFLOW; }
        @Override public EmbeddingResult embed(List<String> texts, AiCredential credential) {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return new EmbeddingResult(List.of(java.util.Collections.nCopies(1024, 0.0)),
                    new AiTokenUsage(2L, 0L));
        }
    }

    private static final class MutableClock extends Clock {
        private final AtomicReference<Instant> instant;
        MutableClock(Instant initial) { instant = new AtomicReference<>(initial); }
        void advanceSeconds(long seconds) { instant.updateAndGet(value -> value.plusSeconds(seconds)); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant.get(); }
    }
}
