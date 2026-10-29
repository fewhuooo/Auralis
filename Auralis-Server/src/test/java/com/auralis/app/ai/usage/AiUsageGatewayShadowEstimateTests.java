package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.shared.config.AuralisProperties;
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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(OutputCaptureExtension.class)
class AiUsageGatewayShadowEstimateTests {
    @Test
    void overviewReservationUsesTheSameResolvedEstimateAsPlanner(CapturedOutput output) throws Exception {
        String system = "SYSTEM rules are kept as UTF-8 bytes.";
        String user = "这是当前资料的中文结构化内容，需要根据上下文总结主题和关键关系。".repeat(80);
        var request = new AiProviderRequest("deepseek-v4-flash", List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                new AiProviderRequest.Message(AiMessageRole.USER, user)), 0.1, 512, true);
        AiInputTokenEstimator.Profile profile = AiInputTokenEstimator.resolve(AiProviderType.DEEPSEEK,
                "https://api.deepseek.com", request.model(), AiInputTokenEstimator.MODE_CALIBRATED_CATEGORY);
        long planned = com.auralis.app.ai.OverviewBudgetPlanner.assessRequest(system, user,
                com.auralis.app.ai.OverviewModelBudget.resolve(AiProviderType.DEEPSEEK,
                        "https://api.deepseek.com", request.model()),
                com.auralis.app.ai.OverviewBudgetPlanner.OutputStage.INTERMEDIATE,
                24, 524_288, 512, profile).estimatedInputTokens();
        Fixture fixture = new Fixture(new AiProviderResponse("ok", 10L, 3L), true, null,
                AiInputTokenEstimator.MODE_CALIBRATED_CATEGORY);
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.SOURCE_OVERVIEW, "estimator-overview-task"))) {
            task.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, request,
                    new AiCredential("https://api.deepseek.com", "synthetic-key"),
                    AiCredentialSource.PLATFORM, 1_000, AiOutputRole.INTERMEDIATE);
        }

        long reserved = fixture.jdbc.queryForObject(
                "select estimated_input_tokens from ai_usage_reservations", Long.class);
        assertThat(reserved).isEqualTo(planned);
        assertThat(output.getOut()).contains("AI_INPUT_TOKEN_ESTIMATE", profile.identity(),
                "strategy=mixed-category-and-bytes", "categoryMessages=1", "byteMessages=1");
        fixture.close();
    }

    @Test
    void logsRequestedAndObservedModelAsSeparateSafeFields(CapturedOutput output) throws Exception {
        var observed = AiProviderModelIdentity.fromProviderValue("vendor/actual-model");
        Fixture fixture = new Fixture(new AiProviderResponse("ok", 5L, 2L, null, observed));
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.CHAT, "model-identity-task"))) {
            task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    new AiProviderRequest("requested-model", List.of(
                            new AiProviderRequest.Message(AiMessageRole.USER, "synthetic")), 0.0, 1),
                    new AiCredential("https://api.deepseek.com/v1", "synthetic-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
        }

        String event = output.getOut().lines()
                .filter(line -> line.contains("AI_TOKEN_ESTIMATE_SHADOW")
                        && line.contains("requestedModel=requested-model"))
                .findFirst().orElseThrow();
        assertThat(event).contains("model=requested-model", "observedModel=vendor/actual-model",
                "observedModelStatus=OBSERVED");
        var reservation = fixture.jdbc.queryForMap("select id, state, feature, stage, provider, model, "
                + "estimated_input_tokens, reserved_output_tokens, actual_input_tokens, actual_output_tokens, "
                + "charged_tokens, request_dispatched from ai_usage_reservations");
        assertThat(reservation.get("estimated_input_tokens")).isEqualTo(13L);
        assertThat(reservation.get("state")).isEqualTo("COMPLETED");
        assertThat(reservation.get("actual_input_tokens")).isEqualTo(5L);
        assertThat(reservation.get("actual_output_tokens")).isEqualTo(2L);
        assertThat(reservation.get("request_dispatched")).isEqualTo(true);
        String requestId = event.substring(event.indexOf("requestId=") + "requestId=".length()).split(" ", 2)[0];
        assertThat(reservation.get("id").toString()).isEqualTo(requestId);
        System.out.printf(java.util.Locale.ROOT,
                "SHADOW_FIXTURE_RESERVATION id=%s state=%s feature=%s stage=%s provider=%s model=%s "
                        + "estimated_input_tokens=%s reserved_output_tokens=%s actual_input_tokens=%s "
                        + "actual_output_tokens=%s charged_tokens=%s request_dispatched=%s%n",
                reservation.get("id"), reservation.get("state"), reservation.get("feature"),
                reservation.get("stage"), reservation.get("provider"), reservation.get("model"),
                reservation.get("estimated_input_tokens"), reservation.get("reserved_output_tokens"),
                reservation.get("actual_input_tokens"), reservation.get("actual_output_tokens"),
                reservation.get("charged_tokens"), reservation.get("request_dispatched"));
        fixture.close();
    }

    @Test
    void streamModelIdentityMergesWithoutChangingDeliveredChunksOrUsage(CapturedOutput output) throws Exception {
        AiProviderModelIdentity modelA = AiProviderModelIdentity.fromProviderValue("vendor/model-a");
        AiProviderModelIdentity sameA = AiProviderModelIdentity.fromProviderValue("vendor/model-a");
        AiProviderModelIdentity modelB = AiProviderModelIdentity.fromProviderValue("vendor/model-b");
        AiProviderModelIdentity invalid = AiProviderModelIdentity.invalid();
        List<List<AiProviderChunk>> scenarios = List.of(
                List.of(metadata(modelA), new AiProviderChunk("answer", false, null, sameA), terminal()),
                List.of(metadata(modelA), new AiProviderChunk("answer", false, null, modelB), terminal()),
                List.of(metadata(modelA), new AiProviderChunk("answer", false, null, invalid), terminal()),
                List.of(metadata(invalid), new AiProviderChunk("answer", false, null, modelA), terminal()),
                List.of(metadata(modelA), metadata(modelB), new AiProviderChunk("answer", false, null, invalid),
                        terminal()));
        List<String> expectedStatuses = List.of("OBSERVED", "CONFLICT", "INVALID", "INVALID", "CONFLICT");

        for (int index = 0; index < scenarios.size(); index++) {
            String requested = "stream-model-" + index;
            Fixture fixture = new Fixture(new AiProviderResponse("unused", 5L, 2L), true, scenarios.get(index));
            List<AiProviderChunk> delivered = new ArrayList<>();
            try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                    fixture.user, AiFeature.CHAT, "stream-observation-" + index))) {
                task.stream(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                        new AiProviderRequest(requested, List.of(
                                new AiProviderRequest.Message(AiMessageRole.USER, "synthetic")), 0.0, 1),
                        new AiCredential("https://api.deepseek.com/v1", "synthetic-key"),
                        AiCredentialSource.PLATFORM, delivered::add);
            }

            assertThat(delivered.stream().map(AiProviderChunk::content).filter(value -> value != null && !value.isEmpty())
                    .toList()).containsExactly("answer");
            assertThat(delivered.stream().filter(AiProviderChunk::complete)).hasSize(1);
            assertThat(fixture.jdbc.queryForObject("select actual_input_tokens from ai_usage_reservations",
                    Long.class)).isEqualTo(5L);
            assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations",
                    Long.class)).isEqualTo(7L);
            String event = output.getOut().lines()
                    .filter(line -> line.contains("AI_TOKEN_ESTIMATE_SHADOW")
                            && line.contains("requestedModel=" + requested))
                    .findFirst().orElseThrow();
            String expectedModel = expectedStatuses.get(index).equals("OBSERVED")
                    ? "vendor/model-a" : "unknown";
            assertThat(event).contains("observedModel=" + expectedModel,
                    "observedModelStatus=" + expectedStatuses.get(index), "usage=complete", "actualInput=5");
            fixture.close();
        }
    }

    private static AiProviderChunk metadata(AiProviderModelIdentity identity) {
        return new AiProviderChunk("", false, null, identity);
    }

    private static AiProviderChunk terminal() {
        return new AiProviderChunk("", true, new AiTokenUsage(5L, 2L));
    }

    @Test
    void logsCompleteUsageComparisonWhileReservationKeepsLegacyUtf8Estimate(CapturedOutput output)
            throws Exception {
        Fixture fixture = new Fixture(new AiProviderResponse("ok", 5L, 2L));
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.CHAT, "prompt-marker-do-not-log"))) {
            task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    new AiProviderRequest("deepseek-chat", List.of(
                            new AiProviderRequest.Message(AiMessageRole.USER, "abc")), 0.0, 1),
                    new AiCredential("https://api.deepseek.com/v1?query-secret", "key-marker"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
        }

        assertThat(fixture.jdbc.queryForObject("select estimated_input_tokens from ai_usage_reservations",
                Long.class)).isEqualTo(7L);
        assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations",
                Long.class)).isEqualTo(7L);
        assertThat(output.getOut()).contains("AI_TOKEN_ESTIMATE_SHADOW", "mode=shadow",
                        "estimatorVersion=char-category-v1-uncalibrated", "usage=complete",
                        "oldEstimate=7", "shadowEstimate=5", "actualInput=5", "shadowError=0",
                        "messageCount=1", "messageFramingTokens=4",
                        "AI_MODEL_CONFIG_EFFECTIVE", "capability=unknown",
                        "thinking=provider-default-or-unknown")
                .doesNotContain("prompt-marker-do-not-log", "query-secret", "key-marker", "https://api.deepseek.com");
        fixture.close();
    }

    @Test
    void comparesCompletionOnSameMessageProjectionWithStableNullRoleAndEmptyContentFraming(CapturedOutput output)
            throws Exception {
        Fixture fixture = new Fixture(new AiProviderResponse("ok", 25L, 2L));
        List<AiProviderRequest.Message> messages = List.of(
                new AiProviderRequest.Message(AiMessageRole.USER, "abc"),
                new AiProviderRequest.Message(null, null),
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, ""),
                new AiProviderRequest.Message(AiMessageRole.USER, "中文"));
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.CHAT, "multi-message-framing-task"))) {
            task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    new AiProviderRequest("deepseek-chat", messages, 0.0, 1),
                    new AiCredential("https://api.deepseek.com/v1", "synthetic-key"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
        }

        assertThat(fixture.jdbc.queryForList("select estimated_input_tokens from ai_usage_reservations", Long.class))
                .containsExactly(25L);
        assertThat(output.getOut()).contains("oldEstimate=25", "shadowEstimate=19", "actualInput=25",
                        "messageCount=4", "messageFramingTokens=16", "oldError=0")
                .doesNotContain("multi-message-framing-task", "synthetic-key", "https://api.deepseek.com");
        fixture.close();
    }

    @Test
    void embeddingShadowProjectionDoesNotAddMessageFraming(CapturedOutput output) throws Exception {
        Fixture fixture = new Fixture(new AiProviderResponse("unused", 5L, 2L));
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.INGESTION, "embedding-no-framing-task"))) {
            task.embed(AiStage.INGESTION_EMBEDDING, AiProviderType.SILICONFLOW,
                    "embedding-model", List.of("abc"),
                    new AiCredential("https://embedding.test/v1", "synthetic-key"), AiCredentialSource.PLATFORM);
        }

        assertThat(fixture.jdbc.queryForList("select estimated_input_tokens from ai_usage_reservations", Long.class))
                .containsExactly(3L);
        assertThat(output.getOut()).contains("oldEstimate=3", "shadowEstimate=1", "messageFramingTokens=0",
                        "actualInput=5")
                .doesNotContain("embedding-no-framing-task", "synthetic-key", "https://embedding.test");
        fixture.close();
    }

    @Test
    void recordsUnknownUsageWithoutInventingActualOrReplacingConservativeSettlement(CapturedOutput output)
            throws Exception {
        Fixture fixture = new Fixture(new AiProviderResponse("ok", (Long) null, (Long) null, null));
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.CHAT, "unknown-usage-task"))) {
            task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    new AiProviderRequest("deepseek-chat", List.of(
                            new AiProviderRequest.Message(AiMessageRole.USER, "abc")), 0.0, 1),
                    new AiCredential("https://api.deepseek.com/v1", "key-marker"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
        }

        assertThat(fixture.jdbc.queryForObject("select estimated_input_tokens from ai_usage_reservations",
                Long.class)).isEqualTo(7L);
        assertThat(fixture.jdbc.queryForObject("select actual_input_tokens from ai_usage_reservations",
                Long.class)).isNull();
        assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations",
                Long.class)).isEqualTo(8L);
        assertThat(output.getOut()).contains("usage=unknown", "actualInput=null", "oldError=null",
                        "shadowError=null", "calibration=UNKNOWN")
                .doesNotContain("key-marker", "https://api.deepseek.com");
        fixture.close();
    }

    @Test
    void shadowObservationCanBeDisabledWithoutChangingReservation(CapturedOutput output) throws Exception {
        Fixture fixture = new Fixture(new AiProviderResponse("ok", 5L, 2L), false);
        try (AiTaskScope task = fixture.gateway.beginTask(new AiTaskContext(
                fixture.user, AiFeature.CHAT, "shadow-disabled-task"))) {
            task.complete(AiStage.CHAT_COMPLETION, AiProviderType.DEEPSEEK,
                    new AiProviderRequest("deepseek-chat", List.of(
                            new AiProviderRequest.Message(AiMessageRole.USER, "abc")), 0.0, 1),
                    new AiCredential("https://api.deepseek.com/v1", "key-marker"), AiCredentialSource.PLATFORM, 1_000, AiOutputRole.GENERAL);
        }

        assertThat(fixture.jdbc.queryForObject("select estimated_input_tokens from ai_usage_reservations",
                Long.class)).isEqualTo(7L);
        assertThat(output.getOut()).doesNotContain("AI_TOKEN_ESTIMATE_SHADOW");
        fixture.close();
    }

    private static final class Fixture implements AutoCloseable {
        private final DriverManagerDataSource source;
        private final JdbcTemplate jdbc;
        private final UUID user;
        private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor();
        private final AiUsageGatewayService gateway;
        private final List<AiProviderChunk> streamingChunks;

        private Fixture(AiProviderResponse response) throws Exception {
            this(response, true, null, AiInputTokenEstimator.MODE_LEGACY_BYTES);
        }

        private Fixture(AiProviderResponse response, boolean shadowEnabled) throws Exception {
            this(response, shadowEnabled, null, AiInputTokenEstimator.MODE_LEGACY_BYTES);
        }

        private Fixture(AiProviderResponse response, boolean shadowEnabled,
                        List<AiProviderChunk> streamingChunks) throws Exception {
            this(response, shadowEnabled, streamingChunks, AiInputTokenEstimator.MODE_LEGACY_BYTES);
        }

        private Fixture(AiProviderResponse response, boolean shadowEnabled,
                        List<AiProviderChunk> streamingChunks, String estimatorMode) throws Exception {
            this.streamingChunks = streamingChunks;
            source = new DriverManagerDataSource("jdbc:h2:mem:shadow" + UUID.randomUUID().toString().replace("-", "")
                    + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
            jdbc = new JdbcTemplate(source);
            jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
            jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                    + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
            try (Connection connection = source.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
            }
            user = UUID.randomUUID();
            jdbc.update("insert into users(id) values (?)", user);
            var transactions = new DataSourceTransactionManager(source);
            var limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000, 2_000_000,
                    60_000, 1_000, 4096, 2, 32_000, 24, 524_288, 512, 16_777_216);
            var ai = new AuralisProperties.Ai(false, "", "DEEPSEEK", new AuralisProperties.Defaults(null, null, null),
                    3_000, 10_000, 120_000, 240_000, 12_000, 8, 5_242_880,
                    32, 32_768, 3_000, 10_000, 3, 1_048_576, List.of(), false,
                    1_000, 60_000, 3, limits, shadowEnabled, true, estimatorMode, List.of(),
                    AuralisProperties.OverviewLimits.withoutAdditionalCaps(), 0);
            AiUsageGuard guard = new AiUsageGuard(jdbc, transactions, Clock.systemUTC(), limits);
            AiProviderPort provider = new AiProviderPort() {
                @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
                @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                    return response;
                }
                @Override public void streamInto(AiProviderRequest request, AiCredential credential,
                                                 java.util.function.Consumer<AiProviderChunk> sink) {
                    if (Fixture.this.streamingChunks != null) {
                        Fixture.this.streamingChunks.forEach(sink);
                    } else {
                        sink.accept(new AiProviderChunk(response.content(), true, response.usage(),
                                response.modelIdentity()));
                    }
                }
            };
            gateway = new AiUsageGatewayService(guard, new AiProviderRegistry(List.of(provider)),
                    new EmbeddingProviderRegistry(List.of(new EmptyEmbeddingProvider())), ai, heartbeat, transactions);
        }

        @Override public void close() { heartbeat.shutdownNow(); }
    }

    private static final class EmptyEmbeddingProvider implements EmbeddingProviderPort {
        @Override public AiProviderType type() { return AiProviderType.SILICONFLOW; }
        @Override public EmbeddingResult embed(List<String> texts, AiCredential credential) {
            return new EmbeddingResult(List.of(java.util.Collections.nCopies(1024, 0.0)),
                    new com.auralis.app.ai.usage.AiTokenUsage(5L, 0L));
        }
    }
}

