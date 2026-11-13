package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiChatRequestCapacity;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderToolCall;
import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.internal.chat.AiChatRequestMapper;
import com.auralis.app.ai.internal.chat.ChatEvidenceHistoryProjector;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleEmbeddingProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.config.AuralisProperties;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
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
import java.util.Set;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
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
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;

@ExtendWith(OutputCaptureExtension.class)
class AiInvocationGatewayTests {

    @Test
    void waitingOverviewHasNoReservationAndDispatchesOnceAfterCapacityIsReleased() throws Exception {
        TestDb db = database();
        UUID user = db.user();
        var policy = limits(100_000, 200_000);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), Clock.systemUTC(), policy);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        var gateway = gateway(guard, provider, Clock.systemUTC(), policy, heartbeat, db.transactions());
        var blocker = guard.beginTask(new AiTaskContext(user, AiFeature.SOURCE_OVERVIEW, "blocker"));
        var active = guard.reserve(blocker, AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, "test-model",
                AiCredentialSource.PLATFORM, AiOutputRole.INTERMEDIATE, 10, 10);
        CountDownLatch waiting = new CountDownLatch(1);
        AtomicInteger validations = new AtomicInteger();
        AtomicInteger reservations = new AtomicInteger();
        AtomicInteger timeouts = new AtomicInteger();
        try (var executor = Executors.newSingleThreadExecutor();
             var scope = gateway.beginTask(new AiTaskContext(user, AiFeature.SUBJECT_OVERVIEW, "waiting"))) {
            var future = executor.submit(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "test-key"),
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE,
                    new OverviewCancellation(), new AiInvocationBinding() {
                        @Override public void beforeReservation() {
                            if (validations.incrementAndGet() == 2) waiting.countDown();
                        }
                        @Override public void onReserved(UUID id) { reservations.incrementAndGet(); }
                        @Override public long responseTimeoutMillis(long requested) {
                            timeouts.incrementAndGet();
                            return Math.min(500, requested);
                        }
                    }));
            try {
                assertThat(waiting.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class))
                        .isEqualTo(1);
                assertThat(provider.completeCalls()).isZero();
            } finally {
                guard.settle(blocker, active, null, false, "NOT_DISPATCHED");
            }
            assertThat(future.get(5, TimeUnit.SECONDS)).isNotNull();
            assertThat(provider.completeCalls()).isEqualTo(1);
            assertThat(reservations.get()).isEqualTo(1);
            assertThat(timeouts.get()).isEqualTo(1);
            assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class))
                    .isEqualTo(2);
        } finally {
            guard.closeTask(blocker);
            heartbeat.shutdownNow();
        }
    }

    @Test
    void providerConcurrencyFailureIsNotRetriedByOverviewAdmission() throws Exception {
        TestDb db = database();
        var policy = limits(100_000, 200_000);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), Clock.systemUTC(), policy);
        TestProvider provider = new TestProvider();
        provider.beforeComplete = () -> { throw new AiUsageLimitException("AI_CONCURRENCY_LIMIT", 429, 1, null); };
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        try (var scope = gateway(guard, provider, Clock.systemUTC(), policy, heartbeat, db.transactions())
                .beginTask(new AiTaskContext(db.user(), AiFeature.SOURCE_OVERVIEW, "provider-failure"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, request(),
                    new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM,
                    1_000, AiOutputRole.INTERMEDIATE, new OverviewCancellation()))
                    .isInstanceOf(AiUsageLimitException.class);
            assertThat(provider.completeCalls()).isEqualTo(1);
        } finally {
            heartbeat.shutdownNow();
        }
    }

    @Test
    void chatHistoryProjectionFitsTheSameMessageAndSerializedCapsTheGatewayEnforces() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000,
                2_000_000, 60_000, 1_000, 16, 2, 100_000, 24, 524_288, 512, 16_777_216);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        ChatAgentProperties chatLimits = new ChatAgentProperties(0, 0, 8, 12,
                65_536, 524_288, 300);
        ObjectMapper objectMapper = new ObjectMapper();
        AiChatRequestMapper requestMapper = new AiChatRequestMapper(objectMapper);
        ChatEvidenceHistoryProjector projector = new ChatEvidenceHistoryProjector(objectMapper);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits, chatLimits);
        AiUsageGatewayService gateway = new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(provider)),
                new EmbeddingProviderRegistry(List.of(new TestEmbeddingProvider())),
                ai(limits), chatLimits, objectMapper, heartbeat, db.transactions());
        ToolSpecification tool = ToolSpecification.builder().name("read_source")
                .description("Read source evidence").parameters(JsonObjectSchema.builder().build()).build();
        List<ChatEvidenceHistoryProjector.HistoryTurn> history = List.of(
                new ChatEvidenceHistoryProjector.HistoryTurn(
                        List.of(UserMessage.from("old user ".repeat(2_000)), AiMessage.from("old answer ".repeat(1_500))),
                        List.of()),
                new ChatEvidenceHistoryProjector.HistoryTurn(
                        List.of(UserMessage.from("newer user ".repeat(2_000)), AiMessage.from("newer answer ".repeat(1_500))),
                        List.of()));
        List<ChatMessage> required = List.of(SystemMessage.from("required context ".repeat(400)));
        List<ChatMessage> current = List.of(UserMessage.from("current question ".repeat(30)));
        long legacyMessageLimit = (long) ai(limits).maxPromptChars() * 4L;
        var unprojected = new ArrayList<ChatMessage>(required);
        history.forEach(turn -> unprojected.addAll(turn.publicMessages()));
        unprojected.addAll(current);
        AiProviderRequest unprojectedMapped = requestMapper.toProviderRequest(ChatRequest.builder()
                .messages(unprojected).toolSpecifications(tool).build(), "test-model", 16);
        AiChatRequestCapacity.Check unprojectedCheck = AiChatRequestCapacity.inspect(unprojectedMapped,
                objectMapper, chatLimits.maxSerializedRequestUtf8Bytes(), chatLimits.maxToolResultUtf8Bytes(),
                legacyMessageLimit);
        assertThat(unprojectedCheck.dimension()).isEqualTo(AiChatRequestCapacity.Dimension.LEGACY_MESSAGE_BYTES);
        assertThat(unprojectedCheck.secondaryBytes()).isLessThan(chatLimits.maxSerializedRequestUtf8Bytes());

        var projection = projector.project(required, history, current, List.of(), List.of(), (messages, reasoning) -> {
            AiProviderRequest mapped = requestMapper.toProviderRequest(ChatRequest.builder()
                    .messages(messages).toolSpecifications(tool).build(), "test-model", 16, reasoning);
            return AiChatRequestCapacity.inspect(mapped, objectMapper,
                    chatLimits.maxSerializedRequestUtf8Bytes(), chatLimits.maxToolResultUtf8Bytes(),
                    legacyMessageLimit);
        });
        assertThat(projection.fits()).isTrue();
        assertThat(projection.messages()).hasSizeLessThan(unprojected.size())
                .noneMatch(message -> message instanceof UserMessage user
                        && user.singleText().startsWith("old user "));
        AiProviderRequest projected = requestMapper.toProviderRequest(ChatRequest.builder()
                .messages(projection.messages()).toolSpecifications(tool).build(), "test-model", 16,
                projection.reasoningByToolCallId());
        assertThat(AiChatRequestCapacity.inspect(projected, objectMapper,
                chatLimits.maxSerializedRequestUtf8Bytes(), chatLimits.maxToolResultUtf8Bytes(),
                legacyMessageLimit).fits()).isTrue();

        UUID runId = UUID.randomUUID();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "chat-agent:" + runId,
                runId, AiOperationKind.CHAT_AGENT_TURN);
        try (AiTaskScope scope = gateway.beginTask(context)) {
            scope.stream(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, projected,
                    new AiCredential("https://provider.test/v1", "synthetic-key"),
                    AiCredentialSource.PLATFORM, ignored -> { });
        } finally {
            heartbeat.shutdownNow();
        }
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where stage='CHAT_COMPLETION'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void chatCapacityRejectsRequiredMessageToolResultAndOutputCapsBeforeReservation(CapturedOutput output)
            throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        ChatAgentProperties chatLimits = new ChatAgentProperties(0, 0, 8, 12,
                65_536, 524_288, 300);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits, chatLimits);
        AiUsageGatewayService gateway = new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(provider)),
                new EmbeddingProviderRegistry(List.of(new TestEmbeddingProvider())),
                ai(limits), chatLimits, new ObjectMapper(), heartbeat, db.transactions());
        UUID runId = UUID.randomUUID();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "chat-agent:" + runId,
                runId, AiOperationKind.CHAT_AGENT_TURN);
        try (AiTaskScope scope = gateway.beginTask(context)) {
            assertChatRequestRejected(scope, requestWithText("必需内容".repeat(12_100), 16));
            AiProviderRequest oversizedToolResult = new AiProviderRequest("test-model", List.of(
                    new AiProviderRequest.Message(AiMessageRole.ASSISTANT, null,
                            List.of(new AiProviderToolCall("call-1", "read_source", "{}")), null, null),
                    new AiProviderRequest.Message(AiMessageRole.TOOL, "工具结果".repeat(22_000), List.of(),
                            "call-1", "read_source")),
                    List.of(new AiProviderToolDefinition("read_source", "Read source", "{}")),
                    0.0, 16, false, false, 0, null);
            assertChatRequestRejected(scope, oversizedToolResult);
            assertChatRequestRejected(scope, requestWithOutput(16_385));
        } finally {
            heartbeat.shutdownNow();
        }
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
        assertThat(provider.completeCalls()).isZero();
        assertThat(output.getOut()).contains("Chat request capacity rejected dimension=LEGACY_MESSAGE_BYTES",
                "Chat request capacity rejected dimension=TOOL_RESULT_BYTES", "actualBytes=", "limitBytes=",
                "serializedRequestBytes=", "messageContentBytes=", "systemContentBytes=",
                "userContentBytes=", "assistantContentBytes=", "toolResultContentBytes=",
                "toolCallArgumentBytes=",
                "reasoningContentBytes=", "toolDefinitionCount=", "toolDefinitionsBytes=")
                .doesNotContain("必需内容", "工具结果");
        assertThat(output.getOut().split("Chat request capacity rejected", -1)).hasSize(3);
    }

    private void assertChatRequestRejected(AiTaskScope scope, AiProviderRequest request) {
        assertThatThrownBy(() -> scope.stream(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request,
                new AiCredential("https://provider.test/v1", "synthetic-key"),
                AiCredentialSource.PLATFORM, ignored -> { }))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_REQUEST_BUDGET_EXCEEDED");
    }

    @Test
    void chatEmbeddingUnlimitedAllowsMoreThanEightReservationsAndModelLimitIsIndependent() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        ChatAgentProperties chatLimits = new ChatAgentProperties(1, 0, 8, 12,
                65_536, 524_288, 300);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits, chatLimits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        UUID runId = UUID.randomUUID();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "chat-agent:" + runId,
                runId, AiOperationKind.CHAT_AGENT_TURN);
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-key");

        try (AiTaskScope scope = gateway.beginTask(context)) {
            for (int i = 0; i < 9; i++) {
                scope.embed(AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW,
                        "embedding-model", List.of("text"), credential, AiCredentialSource.PLATFORM);
            }
            scope.completeChat(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request(), credential,
                    AiCredentialSource.PLATFORM, 1_000, null);
            assertThatThrownBy(() -> scope.completeChat(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    request(), credential, AiCredentialSource.PLATFORM, 1_000, null))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_TASK_BUDGET_EXCEEDED");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where stage='RETRIEVAL_EMBEDDING'", Integer.class))
                .isEqualTo(9);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where stage='CHAT_COMPLETION'", Integer.class))
                .isEqualTo(1);
        var usage = guard.taskUsageForOwner(userId,
                AiTaskContext.chatAgentLedgerTaskId(userId, runId), Set.of(AiOperationKind.CHAT_AGENT_TURN));
        assertThat(usage.stageCalls()).containsEntry(AiStage.RETRIEVAL_EMBEDDING, 9L)
                .containsEntry(AiStage.CHAT_COMPLETION, 1L);
    }

    @Test
    void chatEmbeddingLimitIsIndependentAndSharedAcrossRetryAttempts() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        ChatAgentProperties chatLimits = new ChatAgentProperties(0, 1, 8, 12,
                65_536, 524_288, 300);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits, chatLimits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        UUID runId = UUID.randomUUID();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "chat-agent:" + runId,
                runId, AiOperationKind.CHAT_AGENT_TURN);
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-key");

        try {
            try (AiTaskScope firstAttempt = gateway.beginTask(context)) {
                firstAttempt.embed(AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW,
                        "embedding-model", List.of("text"), credential, AiCredentialSource.PLATFORM);
            }
            try (AiTaskScope retry = gateway.beginTask(context)) {
                assertThatThrownBy(() -> retry.embed(AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW,
                        "embedding-model", List.of("text"), credential, AiCredentialSource.PLATFORM))
                        .isInstanceOf(AiUsageLimitException.class)
                        .extracting(error -> ((AiUsageLimitException) error).code())
                        .isEqualTo("AI_TASK_BUDGET_EXCEEDED");
                retry.completeChat(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request(), credential,
                        AiCredentialSource.PLATFORM, 1_000, null);
            }
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where stage='RETRIEVAL_EMBEDDING'", Integer.class))
                .isEqualTo(1);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations where stage='CHAT_COMPLETION'", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void chatAgentAndOverviewThinkingPoliciesStayRequestScopedDuringConcurrentCalls() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        CountDownLatch arrivals = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        provider.beforeComplete = () -> {
            arrivals.countDown();
            try {
                if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("concurrent calls did not overlap");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError(exception);
            }
        };
        UUID chatRunId = UUID.randomUUID();
        AiTaskContext chatContext = new AiTaskContext(userId, AiFeature.CHAT, "chat-thinking",
                AiTaskContext.chatAgentLedgerTaskId(userId, chatRunId), AiOperationKind.CHAT_AGENT_TURN);
        AiTaskContext overviewContext = new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "overview-thinking");
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-key");
        var executor = Executors.newFixedThreadPool(2);
        Future<?> chat = executor.submit(() -> {
            try (AiTaskScope scope = gateway.beginTask(chatContext)) {
                scope.completeChat(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request(), credential,
                        AiCredentialSource.PLATFORM, 1_000, null);
            }
        });
        Future<?> overview = executor.submit(() -> {
            try (AiTaskScope scope = gateway.beginTask(overviewContext)) {
                scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, request(), credential,
                        AiCredentialSource.PLATFORM, 1_000, AiOutputRole.FINAL);
            }
        });
        try {
            assertThat(arrivals.await(5, TimeUnit.SECONDS)).isTrue();
        } finally {
            release.countDown();
        }
        try {
            chat.get(10, TimeUnit.SECONDS);
            overview.get(10, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
            heartbeat.shutdownNow();
        }

        assertThat(provider.requests).extracting(AiProviderRequest::thinkingEnabled)
                .containsExactlyInAnyOrder(true, false);
    }

    @Test
    void byokCallInMixedTaskIsAuditedButDoesNotConsumePlatformTaskQuota() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits base = limits(100_000, 200_000);
        AuralisProperties.Limits platformOnlyOneCall = new AuralisProperties.Limits(
                base.globalConcurrent(), base.perUserConcurrent(), base.perUserHourlyTokens(),
                base.perUserDailyTokens(), base.globalDailyTokens(), base.reservationLeaseMillis(),
                base.heartbeatMillis(), base.chatMaxOutputTokens(), 1, 6,
                base.overviewMaxCalls(), base.overviewTaskTokens(), base.ingestionMaxCalls(),
                base.ingestionTaskTokens());
        var provider = new TestProvider();
        var heartbeat = Executors.newScheduledThreadPool(2);
        var guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, platformOnlyOneCall);
        var gateway = gateway(guard, provider, clock, platformOnlyOneCall, heartbeat, db.transactions());
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "mixed-source-task");
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-test-key");
        UUID scopeTaskId;
        try (AiTaskScope scope = gateway.beginTask(context)) {
            scopeTaskId = scope.taskId();
            scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request(), credential,
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
            scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request(), credential,
                    AiCredentialSource.USER_SUPPLIED, 1_000, AiOutputRole.GENERAL);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(2);
        assertThat(db.jdbc().queryForList("select credential_source from ai_usage_reservations order by created_at", String.class))
                .containsExactly("PLATFORM", "USER_SUPPLIED");
        assertThat(db.jdbc().queryForList("select task_id from ai_usage_reservations order by created_at", UUID.class))
                .containsOnly(scopeTaskId);
        AiTaskUsageSnapshot taskUsage = guard.taskUsageForOwner(userId, scopeTaskId,
                java.util.Set.of(AiOperationKind.CHAT_TURN));
        assertThat(taskUsage.taskId()).isEqualTo(scopeTaskId);
        assertThat(taskUsage.groups()).containsKeys("CHAT_TURN:PLATFORM", "CHAT_TURN:USER_SUPPLIED");
        assertThatThrownBy(() -> guard.taskUsageForOwner(UUID.randomUUID(), scopeTaskId,
                java.util.Set.of(AiOperationKind.CHAT_TURN))).isInstanceOf(com.auralis.app.shared.error.DomainException.class);
        AiUsageSnapshot snapshot = guard.snapshotForUser(userId);
        assertThat(snapshot.hourly().chargedTokens()).isEqualTo(8);
        assertThat(snapshot.allCalls().get(AiCredentialSource.PLATFORM).chargedTokens()).isEqualTo(8);
        assertThat(snapshot.allCalls().get(AiCredentialSource.USER_SUPPLIED).chargedTokens()).isEqualTo(8);
    }

    @Test
    void sourceLessGatewayCallFailsBeforeReservationOrProviderDispatch() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.CHAT, "missing-source"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "synthetic-test-key"), 120_000L))
                    .isInstanceOf(AiPolicyContractException.class);
        } finally {
            heartbeat.shutdownNow();
        }
        assertThat(provider.completeCalls()).isZero();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
    }

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
            firstAttempt.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, request(),
                    new AiCredential("https://provider.test/v1", "synthetic-test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE);
        }
        try (AiTaskScope retry = gateway.beginTask(context)) {
            assertThatThrownBy(() -> retry.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "different-profile-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE))
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
                assertThatThrownBy(() -> failed.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                        request(), new AiCredential("https://provider.test/v1", "synthetic-test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE))
                        .isInstanceOf(IllegalStateException.class);
                failedUsage = failed.usage();
            }
            try (AiTaskScope retry = gateway.beginTask(context)) {
                retry.complete(AiStage.OVERVIEW_REDUCE, AiProviderType.OPENAI_COMPATIBLE, request(),
                        new AiCredential("https://provider.test/v1", "synthetic-test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE);
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
                    scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, request(),
                            new AiCredential("https://provider.test/v1", "synthetic-test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE);
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
    void overviewOutputUsesConfiguredModelCapacityAndReservesRequestedAmount() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-test-key");
        AiProviderRequest accepted = requestWithOutput(8_192);
        AiProviderRequest excessive = requestWithOutput(16_385);

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW, "subject-output-cap"))) {
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, accepted, credential,
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.FINAL);
        }
        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "source-output-over-cap"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    excessive, credential, AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE))
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
    void overviewInputMayExceedSharedPromptByteLimitWhenModelCapacityAndTaskBudgetFit() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(200_000, 300_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-test-key");
        AiProviderRequest large = new AiProviderRequest("test-model",
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, "x".repeat(60_000))), 0.0, 8_192);

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "overview-large-input"))) {
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE, large, credential,
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(provider.lastRequest.overviewCapacityRequest()).isTrue();
        assertThat(provider.lastRequest.maxTokens()).isEqualTo(8_192);
        assertThat(db.jdbc().queryForObject("select estimated_input_tokens from ai_usage_reservations", Long.class))
                .isEqualTo(60_072L);
        assertThat(db.jdbc().queryForObject("select reserved_output_tokens from ai_usage_reservations", Long.class))
                .isEqualTo(8_192L);
    }

    @Test
    void positiveOverviewLimitsAreAppliedBeforeReservationAndPassedToProviderTransport() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AuralisProperties.OverviewLimits overviewLimits = new AuralisProperties.OverviewLimits(
                12, 100, 100, 1_000, 12_345,
                0, 0,
                0, 0, 0, 0);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions(),
                ai(limits, overviewLimits));
        AiCredential credential = new AiCredential("https://provider.test/v1", "synthetic-test-key");

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "overview-positive-caps"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    requestWithText("x".repeat(13), 1_000), credential,
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_REQUEST_BUDGET_EXCEEDED");
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    requestWithText("x".repeat(10), 1_001), credential,
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_REQUEST_BUDGET_EXCEEDED");
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    requestWithText("x".repeat(10), 1_000), credential,
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(provider.lastRequest.overviewResponseByteLimit()).isEqualTo(12_345);
        assertThat(provider.lastRequest.maxTokens()).isEqualTo(1_000);
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(1);
    }

    @Test
    void overviewUnknownModelFailsBeforeReservationAndProviderDispatch() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AuralisProperties.Ai ai = new AuralisProperties.Ai(false, "", null,
                null, 3_000, 10_000, 120_000, 240_000,
                12_000, 8, 5_242_880, 32, 32_768, 3_000, 10_000, 3, 1_048_576,
                List.of(), false, 1_000, 60_000, 3, limits, true, List.of(),
                AuralisProperties.OverviewLimits.withoutAdditionalCaps());
        AiInvocationGateway gateway = new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(provider)),
                new EmbeddingProviderRegistry(List.of(new TestEmbeddingProvider())), ai, heartbeat,
                db.transactions());

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "overview-unknown-model"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://unconfigured.test/v1", "synthetic-test-key"),
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE))
                    .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                    .hasMessageContaining("Overview model capacity is not configured");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isZero();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
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
            scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, requestWithOutput(4_096),
                    credential, AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
        }
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.CHAT, "chat-4097"))) {
            assertThatThrownBy(() -> scope.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    new AiProviderRequest("test-model",
                            List.of(new AiProviderRequest.Message(AiMessageRole.USER, "x")),
                            0.0, 4_097, false, true, Long.MAX_VALUE),
                    credential, AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_REQUEST_BUDGET_EXCEEDED");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isEqualTo(1);
        assertThat(provider.lastRequest.overviewCapacityRequest()).isFalse();
        assertThat(provider.lastRequest.overviewResponseByteLimit()).isZero();
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
                    AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request,
                    new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
            assertThat(result.usage().chargedTokens()).isEqualTo(8);
            assertThat(result.usage().providerUsageComplete()).isTrue();
        }

        assertThatThrownBy(() -> {
            try (AiTaskScope second = gateway.beginTask(secondContext)) {
                second.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE, request,
                        new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
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
    void overviewTaskOwnerFenceFailureWithConcurrencyCodeDoesNotWaitForCapacity() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        TestProvider provider = new TestProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = gateway(guard, provider, clock, limits, heartbeat, db.transactions());
        OverviewCancellation cancellation = new OverviewCancellation();
        ScheduledExecutorService cancelAfterBound = Executors.newSingleThreadScheduledExecutor();
        cancelAfterBound.schedule(() -> cancellation.cancel(OverviewCancellation.Reason.NO_INTEREST),
                300, TimeUnit.MILLISECONDS);

        try (AiTaskScope task = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW, "overview-owner-lost"))) {
            db.jdbc().update("update ai_usage_locks set owner_id=? where current_task_id=?",
                    UUID.randomUUID(), task.taskId());
            assertThatThrownBy(() -> task.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "synthetic-key"),
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE, cancellation))
                    .isInstanceOf(AiUsageLimitException.class)
                    .extracting(error -> ((AiUsageLimitException) error).code())
                    .isEqualTo("AI_CONCURRENCY_LIMIT");
        } finally {
            cancelAfterBound.shutdownNow();
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isZero();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
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
            assertThatThrownBy(() -> task.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL))
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
    void cancellationBeforeAdmissionDoesNotDispatchOrChargeAndReleasesTaskLease() throws Exception {
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
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE, cancellation))
                    .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                    .extracting(failure -> ((com.auralis.app.shared.error.DomainException) failure).code())
                    .isEqualTo("MODEL_TIMEOUT");
        } finally {
            scope.close();
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls()).isZero();
        assertThat(db.jdbc().queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
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
            assertThatThrownBy(() -> task.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL))
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
                    AiProviderType.OPENAI_COMPATIBLE, request(),
                    new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL));
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
            assertThat(scope.stream(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, chunk -> streamed.add(chunk.content())).usage().providerUsageComplete()).isTrue();
            assertThat(streamed).containsExactly("streamed");
            assertThat(scope.embed(AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW,
                    "embedding-model", List.of("text"),
                    new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM)
                    .usage().providerUsageComplete()).isTrue();
        }
        heartbeat.shutdownNow();
    }

    @Test
    void chargesOpenAiCompatibleEmbeddingUsageThroughGatewayAndLedger() throws Exception {
        TestDb db = database();
        UUID userId = db.user();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-10T10:00:00Z"));
        AuralisProperties.Limits limits = limits(100_000, 200_000);
        URI baseUri = URI.create("https://embedding.test/v1");
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "embedding.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, baseUri)).thenReturn(endpoint);
        String vector = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
        String response = "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                + "\"usage\":{\"prompt_tokens\":7454,\"completion_tokens\":0,\"total_tokens\":7454}}";
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> response.getBytes(StandardCharsets.UTF_8);
        OpenAiCompatibleEmbeddingProvider embeddingProvider = new OpenAiCompatibleEmbeddingProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 100_000));
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);
        AiUsageGuard guard = new AiUsageGuard(db.jdbc(), db.transactions(), clock, limits);
        AiInvocationGateway gateway = new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(new TestProvider())),
                new EmbeddingProviderRegistry(List.of(embeddingProvider)),
                ai(limits), heartbeat, db.transactions());

        try (AiTaskScope scope = gateway.beginTask(
                new AiTaskContext(userId, AiFeature.INGESTION, "controlled-embedding-usage"))) {
            var result = scope.embed(AiStage.INGESTION_EMBEDDING, AiProviderType.OPENAI_COMPATIBLE,
                    "BAAI/bge-m3", List.of("x".repeat(31_487)),
                    new AiCredential(baseUri.toString(), "synthetic-key", "BAAI/bge-m3"), AiCredentialSource.PLATFORM);

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
            assertThatThrownBy(() -> task.complete(AiStage.CHAT_COMPLETION, AiProviderType.OPENAI_COMPATIBLE,
                    request(), new AiCredential("https://provider.test/v1", "test-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL))
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
        return ai(limits, AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }

    private AuralisProperties.Ai ai(AuralisProperties.Limits limits,
                                   AuralisProperties.OverviewLimits overviewLimits) {
        return new AuralisProperties.Ai(false, "", new AuralisProperties.GenerationEndpoint(
                "https://provider.test/v1", "test-model", "synthetic-key", 100_000, 16_384), null,
                3_000, 10_000, 120_000, 240_000, 12_000, 8, 5_242_880,
                32, 32_768, 3_000, 10_000, 3, 1_048_576, List.of(), false,
                1_000, 60_000, 3, limits, true, List.of(), overviewLimits);
    }

    private AiInvocationGateway gateway(AiUsageGuard guard, TestProvider provider, Clock clock,
                                        AuralisProperties.Limits limits, ScheduledExecutorService heartbeat,
                                        DataSourceTransactionManager transactions, AuralisProperties.Ai ai) {
        return new AiUsageGatewayService(guard,
                new AiProviderRegistry(List.of(provider)),
                new EmbeddingProviderRegistry(List.of(new TestEmbeddingProvider())),
                ai, heartbeat, transactions);
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

    private AiProviderRequest requestWithText(String text, int maxTokens) {
        return new AiProviderRequest("test-model",
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, text)), 0.0, maxTokens);
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
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
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
        private final java.util.concurrent.CopyOnWriteArrayList<AiProviderRequest> requests =
                new java.util.concurrent.CopyOnWriteArrayList<>();
        private volatile Runnable beforeComplete = () -> { };
        private volatile AiProviderRequest lastRequest;

        @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return complete(request, credential, 0);
        }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                    long timeoutMillis) {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            lastRequest = request;
            requests.add(request);
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
                                        AiProviderCallCancellation cancellation,
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
