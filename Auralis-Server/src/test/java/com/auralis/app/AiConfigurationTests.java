package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.core.env.Environment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.test.context.TestPropertySource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@TestPropertySource(properties = {
        "DEEPSEEK_API_KEY=env-chat-key",
        "SILICONFLOW_API_KEY=env-embedding-key"
})
class AiConfigurationTests {

    @Test
    void declaresOverviewTaskAndEmbeddingBatchSafetyLimits() {
        assertThat(java.util.Arrays.stream(AuralisProperties.Ai.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .contains("overviewTaskTimeoutMillis", "ingestionEmbeddingBatchMaxItems",
                        "ingestionEmbeddingBatchMaxUtf8Bytes", "overviewMaxRetries");
    }

    @Autowired
    private AuralisProperties properties;

    @Autowired
    private Environment environment;

    @Test
    void bindsSafeLocalAiDefaultsAndLimits() {
        assertThat(properties.ai().enabled()).isFalse();
        assertThat(properties.ai().defaultProvider()).isEqualTo("DEEPSEEK");
        assertThat(properties.ai().maxPromptChars()).isEqualTo(12_000);
        assertThat(properties.ai().maxRetrievedChunks()).isEqualTo(8);
        assertThat(properties.ai().providerConnectTimeoutMillis()).isEqualTo(3_000L);
        assertThat(properties.ai().requestTimeoutMillis()).isEqualTo(10_000L);
        assertThat(properties.ai().overviewResponseTimeoutMillis()).isEqualTo(120_000L);
        assertThat(properties.ai().overviewTaskTimeoutMillis()).isEqualTo(240_000L);
        assertThat(properties.ai().overviewMaxRetries()).isEqualTo(3);
        assertThat(properties.ai().shadowTokenEstimateEnabled()).isTrue();
        assertThat(properties.ai().overviewInputTokenEstimatorMode()).isEqualTo("legacy-bytes");
        assertThat(properties.ai().overviewOutputRecoveryEnabled()).isTrue();
        assertThat(properties.ai().overviewModelCapacities()).isEmpty();
        assertThat(properties.ai().overviewLimits())
                .isEqualTo(AuralisProperties.OverviewLimits.withoutAdditionalCaps());
        assertThat(properties.ai().ingestionMaxBytes()).isEqualTo(5_242_880L);
        assertThat(properties.ai().ingestionEmbeddingBatchMaxItems()).isEqualTo(32);
        assertThat(properties.ai().ingestionEmbeddingBatchMaxUtf8Bytes()).isEqualTo(32_768L);
        assertThat(properties.ai().urlMaxRedirects()).isEqualTo(3);
        assertThat(properties.ai().providerMaxResponseBytes()).isEqualTo(1_048_576L);
        assertThat(properties.ai().allowedProviderHosts())
                .containsExactly("api.deepseek.com", "api.openai.com", "api.siliconflow.cn");
        assertThat(properties.ai().ingestionWorkerEnabled()).isTrue();
        assertThat(properties.ai().ingestionPollDelayMillis()).isEqualTo(1_000L);
        assertThat(properties.ai().ingestionLeaseMillis()).isEqualTo(300_000L);
        assertThat(properties.ai().ingestionMaxAttempts()).isEqualTo(3);
        assertThat(properties.ai().limits().globalConcurrent()).isEqualTo(4);
        assertThat(properties.ai().limits().perUserConcurrent()).isEqualTo(2);
        assertThat(properties.ai().limits().perUserHourlyTokens()).isEqualTo(1_000_000L);
        assertThat(properties.ai().limits().perUserDailyTokens()).isEqualTo(2_000_000L);
        assertThat(properties.ai().limits().globalDailyTokens()).isEqualTo(2_000_000L);
        assertThat(properties.ai().limits().reservationLeaseMillis()).isEqualTo(300_000L);
        assertThat(properties.ai().limits().heartbeatMillis()).isEqualTo(10_000L);
        assertThat(properties.ai().limits().chatMaxOutputTokens()).isEqualTo(4096);
        assertThat(properties.ai().limits().chatMaxCalls()).isEqualTo(2);
        assertThat(properties.ai().limits().chatTaskTokens()).isEqualTo(32_000L);
        assertThat(properties.ai().limits().overviewMaxCalls()).isZero();
        assertThat(properties.ai().limits().overviewTaskTokens()).isEqualTo(524_288L);
        assertThat(properties.ai().limits().ingestionMaxCalls()).isEqualTo(512);
        assertThat(properties.ai().limits().ingestionTaskTokens()).isEqualTo(16_777_216L);
        assertThat(environment.getProperty("auralis.ai.defaults.deepseek.api-key"))
                .isEqualTo("env-chat-key");
        assertThat(environment.getProperty("auralis.ai.thinking-enabled", Boolean.class, false)).isFalse();
        assertThat(environment.getProperty("auralis.ai.defaults.siliconflow.api-key"))
                .isEqualTo("env-embedding-key");
        assertThat(properties.ai().defaults().siliconflow().baseUrl())
                .isEqualTo("https://api.siliconflow.cn/v1");
        assertThat(properties.ai().defaults().siliconflow().chatModel())
                .isEqualTo("deepseek-ai/DeepSeek-V3");
        assertThat(properties.ai().defaults().siliconflow().embeddingModel())
                .isEqualTo("BAAI/bge-m3");
    }

    @Test
    void doesNotExposeEnvProviderKeyInConfigurationToString() {
        AuralisProperties.Provider provider = new AuralisProperties.Provider(
                "https://provider.test", "chat-model", "embedding-model", "env-secret");

        assertThat(provider.toString()).doesNotContain("env-secret");
        assertThat(provider.toString()).contains("<redacted>");
    }

    @Test
    void bindsOverviewOutputRecoverySwitchToFalse() {
        var source = new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.overview-output-recovery-enabled", "false"));

        var bound = new Binder(source).bind("auralis.ai", AuralisProperties.Ai.class).get();

        assertThat(bound.overviewOutputRecoveryEnabled()).isFalse();
    }

    @Test
    void bindsExplicitOverviewModelCapacityAndLongerConfiguredTimeouts() {
        var values = new java.util.LinkedHashMap<String, Object>();
        values.put("auralis.ai.overview-response-timeout-millis", "600000");
        values.put("auralis.ai.overview-task-timeout-millis", "1200000");
        values.put("auralis.ai.overview-model-capacities[0].provider", "OPENAI_COMPATIBLE");
        values.put("auralis.ai.overview-model-capacities[0].endpoint", "https://provider.test/v1");
        values.put("auralis.ai.overview-model-capacities[0].model", "custom-model");
        values.put("auralis.ai.overview-model-capacities[0].context-window-tokens", "800000");
        values.put("auralis.ai.overview-model-capacities[0].max-output-tokens", "64000");
        values.put("auralis.ai.overview-limits.max-prompt-chars", "250000");
        values.put("auralis.ai.overview-limits.max-request-bytes", "1000000");
        values.put("auralis.ai.overview-limits.max-input-tokens", "700000");
        values.put("auralis.ai.overview-limits.max-output-tokens", "60000");
        values.put("auralis.ai.overview-limits.max-response-bytes", "4000000");
        values.put("auralis.ai.overview-limits.max-result-chars", "2000000");
        values.put("auralis.ai.overview-limits.max-checkpoint-chars", "3000000");
        values.put("auralis.ai.overview-limits.max-plan-chars", "4000000");
        values.put("auralis.ai.overview-limits.max-node-descriptor-chars", "500000");
        values.put("auralis.ai.overview-limits.max-chapters", "200");
        values.put("auralis.ai.overview-limits.max-sections", "2000");
        values.put("auralis.ai.overview-limits.max-prose-chars", "200000");
        values.put("auralis.ai.overview-limits.max-guide-items", "100");
        values.put("auralis.ai.overview-limits.max-source-ids-per-section", "1000");
        values.put("auralis.ai.overview-limits.max-provenance-sections", "2000");
        values.put("auralis.ai.overview-limits.max-provenance-refs-per-section", "1000");
        values.put("auralis.ai.overview-limits.max-provenance-refs", "100000");
        values.put("auralis.ai.overview-limits.max-provenance-locations", "100000");
        values.put("auralis.ai.overview-limits.max-writer-nodes-per-plan", "100");
        values.put("auralis.ai.overview-limits.max-input-snapshot-chars", "5000000");
        values.put("auralis.ai.overview-limits.max-source-manifest-chars", "6000000");
        values.put("auralis.ai.overview-limits.max-job-request-chars", "7000000");
        values.put("auralis.ai.overview-limits.max-sources", "500");
        values.put("auralis.ai.overview-limits.max-title-chars", "5000");
        values.put("auralis.ai.overview-limits.max-identity-chars", "8000000");
        values.put("auralis.ai.overview-limits.max-provenance-locations-per-ref", "200");
        var source = new MapConfigurationPropertySource(values);

        var bound = new Binder(source).bind("auralis.ai", AuralisProperties.Ai.class).get();

        assertThat(bound.overviewResponseTimeoutMillis()).isEqualTo(600_000L);
        assertThat(bound.overviewTaskTimeoutMillis()).isEqualTo(1_200_000L);
        assertThat(bound.overviewModelCapacities()).containsExactly(
                new AuralisProperties.OverviewModelCapacity(
                        "OPENAI_COMPATIBLE",
                        "https://provider.test/v1", "custom-model", 800_000, 64_000));
        assertThat(bound.overviewLimits()).isEqualTo(
                new AuralisProperties.OverviewLimits(250_000, 1_000_000, 700_000, 60_000, 4_000_000,
                        2_000_000, 3_000_000, 4_000_000, 500_000, 200, 2_000, 200_000,
                        100, 1_000, 2_000, 1_000, 100_000, 100_000, 100,
                        5_000_000, 6_000_000, 7_000_000, 500, 5_000, 8_000_000, 200));
    }

    @Test
    void bindsOverviewRetryCountAndRejectsNegativeValues() {
        var disabled = new Binder(new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.overview-max-retries", "0")))
                .bind("auralis.ai", AuralisProperties.Ai.class).get();
        var configured = new Binder(new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.overview-max-retries", "7")))
                .bind("auralis.ai", AuralisProperties.Ai.class).get();
        var invalid = new Binder(new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.overview-max-retries", "-1")))
                .bind("auralis.ai", AuralisProperties.Ai.class).get();

        assertThat(disabled.overviewMaxRetries()).isZero();
        assertThat(configured.overviewMaxRetries()).isEqualTo(7);
        assertThat(Validation.buildDefaultValidatorFactory().getValidator().validate(invalid))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewMaxRetries"));
    }

    @Test
    void bindsOverviewModelCapacityFromSpringEnvironmentListSyntax() {
        var source = new SystemEnvironmentPropertySource("overview-capacity-systemEnvironment", java.util.Map.of(
                "AURALIS_AI_OVERVIEW_MAX_RETRIES", "0",
                "AURALIS_AI_OVERVIEWMODELCAPACITIES_0_PROVIDER", "OPENAI_COMPATIBLE",
                "AURALIS_AI_OVERVIEWMODELCAPACITIES_0_ENDPOINT", "https://provider.test/v1",
                "AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MODEL", "custom-model",
                "AURALIS_AI_OVERVIEWMODELCAPACITIES_0_CONTEXTWINDOWTOKENS", "900000",
                "AURALIS_AI_OVERVIEWMODELCAPACITIES_0_MAXOUTPUTTOKENS", "64000"));

        var bound = new Binder(ConfigurationPropertySources.from(source))
                .bind("auralis.ai", AuralisProperties.Ai.class).get();

        assertThat(bound.overviewModelCapacities()).containsExactly(
                new AuralisProperties.OverviewModelCapacity(
                        "OPENAI_COMPATIBLE",
                        "https://provider.test/v1", "custom-model", 900_000, 64_000));
        assertThat(bound.overviewMaxRetries()).isZero();
    }

    @Test
    void rejectsUnsupportedOverviewModelCapacityProviderDuringBinding() {
        var source = new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.overview-model-capacities[0].provider", "CUSTOM_PROVIDER",
                "auralis.ai.overview-model-capacities[0].endpoint", "https://provider.test/v1",
                "auralis.ai.overview-model-capacities[0].model", "custom-model",
                "auralis.ai.overview-model-capacities[0].context-window-tokens", "900000",
                "auralis.ai.overview-model-capacities[0].max-output-tokens", "64000"));

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                new Binder(source).bind("auralis.ai", AuralisProperties.Ai.class).get())
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void composeAndExampleExposeEveryOverviewLimitWithDynamicDefault() throws IOException {
        Path root = repositoryRoot();
        String compose = Files.readString(root.resolve("docker-compose.yml"));
        String exampleEnv = Files.readString(root.resolve(".env.example"));
        String application = Files.readString(root.resolve("Auralis-Server/src/main/resources/application.yml"));
        assertThat(compose).contains("AURALIS_AI_OVERVIEW_MAX_RETRIES");
        assertThat(exampleEnv).contains("AURALIS_AI_OVERVIEW_MAX_RETRIES=3");
        assertThat(application).contains("overview-max-retries: ${AURALIS_AI_OVERVIEW_MAX_RETRIES:3}");
        List<String> variables = List.of(
                "AURALIS_AI_OVERVIEW_MAX_PROMPT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_REQUEST_BYTES",
                "AURALIS_AI_OVERVIEW_MAX_INPUT_TOKENS",
                "AURALIS_AI_OVERVIEW_MAX_OUTPUT_TOKENS",
                "AURALIS_AI_OVERVIEW_MAX_RESPONSE_BYTES",
                "AURALIS_AI_OVERVIEW_MAX_RESULT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_CHECKPOINT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_PLAN_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_NODE_DESCRIPTOR_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_CHAPTERS",
                "AURALIS_AI_OVERVIEW_MAX_SECTIONS",
                "AURALIS_AI_OVERVIEW_MAX_PROSE_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_GUIDE_ITEMS",
                "AURALIS_AI_OVERVIEW_MAX_SOURCE_IDS_PER_SECTION",
                "AURALIS_AI_OVERVIEW_MAX_PROVENANCE_SECTIONS",
                "AURALIS_AI_OVERVIEW_MAX_PROVENANCE_REFS_PER_SECTION",
                "AURALIS_AI_OVERVIEW_MAX_PROVENANCE_REFS",
                "AURALIS_AI_OVERVIEW_MAX_PROVENANCE_LOCATIONS",
                "AURALIS_AI_OVERVIEW_MAX_WRITER_NODES_PER_PLAN",
                "AURALIS_AI_OVERVIEW_MAX_INPUT_SNAPSHOT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_SOURCE_MANIFEST_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_JOB_REQUEST_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_SOURCES",
                "AURALIS_AI_OVERVIEW_MAX_TITLE_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_IDENTITY_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_PROVENANCE_LOCATIONS_PER_REF");

        for (String variable : variables) {
            assertThat(compose).contains(variable + ": ${" + variable + ":-0}");
            assertThat(exampleEnv).contains(variable + "=0");
            assertThat(application).contains("${" + variable + ":0}");
        }
        assertThat(compose).contains("AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS: ${AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS:-0}");
        assertThat(exampleEnv).contains("AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS=0");
        assertThat(application).contains("${AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS:0}");
    }

    @Test
    void bindsShadowTokenEstimateSwitchToTrueAndFalse() {
        var enabledSource = new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.shadow-token-estimate-enabled", "true"));
        var disabledSource = new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.shadow-token-estimate-enabled", "false"));

        var enabled = new Binder(enabledSource).bind("auralis.ai", AuralisProperties.Ai.class).get();
        var disabled = new Binder(disabledSource).bind("auralis.ai", AuralisProperties.Ai.class).get();

        assertThat(enabled.shadowTokenEstimateEnabled()).isTrue();
        assertThat(disabled.shadowTokenEstimateEnabled()).isFalse();
    }

    @Test
    void bindsOverviewInputEstimatorModeAndRejectsUnknownValues() {
        var candidateSource = new MapConfigurationPropertySource(java.util.Map.of(
                "auralis.ai.overview-input-token-estimator-mode", "calibrated-category"));
        var candidate = new Binder(candidateSource).bind("auralis.ai", AuralisProperties.Ai.class).get();
        assertThat(candidate.overviewInputTokenEstimatorMode()).isEqualTo("calibrated-category");

        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        assertThat(validator.validate(aiProperties(new AuralisProperties.Defaults(null, null, null), 120_000L)))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewInputTokenEstimatorMode"));
        assertThat(validator.validate(aiProperties(new AuralisProperties.Defaults(null, null, null), 120_000L,
                "unrecognized")))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewInputTokenEstimatorMode"));
    }

    @Test
    void rejectsOverviewResponseTimeoutBelowSixtySecondsAndAllowsLongerCalls() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var defaults = new AuralisProperties.Defaults(null, null, null);

        assertThat(validator.validate(aiProperties(defaults, 59_999L)))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewResponseTimeoutMillis"));
        assertThat(validator.validate(aiProperties(defaults, 120_001L)))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewResponseTimeoutMillis"));
    }

    @Test
    void requiresTaskDeadlineAndEmbeddingBatchLimitsToStayWithinSafeBounds() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var properties = aiProperties(new AuralisProperties.Defaults(null, null, null), 120_000L);

        assertThat(properties.overviewOutputRecoveryEnabled()).isTrue();
        assertThat(validator.validate(properties))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
    }

    @Test
    void acceptsZeroTaskTimeoutToDisableDirectRequestDeadlineButRejectsNegativeValues() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var defaults = new AuralisProperties.Defaults(null, null, null);

        assertThat(validator.validate(aiProperties(defaults, 120_000L, 0)))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
        assertThat(validator.validate(aiProperties(defaults, 120_000L, -1)))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
    }

    @Test
    void rejectsUnsafeUsageHeartbeatAndQuotaRelationships() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var invalidHeartbeat = new AuralisProperties.Limits(
                4, 2, 100_000, 200_000, 2_000_000, 300_000, 100_001,
                4096, 2, 32_000, 24, 524_288, 512, 16_777_216);
        var invalidQuota = new AuralisProperties.Limits(
                4, 2, 300_000, 200_000, 2_000_000, 300_000, 10_000,
                4096, 2, 32_000, 24, 524_288, 512, 16_777_216);
        var highOverviewCalls = new AuralisProperties.Limits(
                4, 2, 100_000, 200_000, 2_000_000, 300_000, 10_000,
                4096, 2, 32_000, 2_000, 524_288, 512, 16_777_216);

        assertThat(validator.validate(invalidHeartbeat))
                .anyMatch(error -> error.getPropertyPath().toString().equals("heartbeatWindowSafe"));
        assertThat(validator.validate(invalidQuota))
                .anyMatch(error -> error.getPropertyPath().toString().equals("quotaWindowSafe"));
        assertThat(validator.validate(highOverviewCalls))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewMaxCalls"));
    }

    private AuralisProperties.Ai aiProperties(AuralisProperties.Defaults defaults, long overviewTimeoutMillis) {
        return aiProperties(defaults, overviewTimeoutMillis, "legacy-bytes");
    }

    private Path repositoryRoot() throws IOException {
        Path candidate = Path.of("").toAbsolutePath();
        while (candidate != null) {
            if (Files.isRegularFile(candidate.resolve("docker-compose.yml"))) return candidate;
            candidate = candidate.getParent();
        }
        throw new IOException("Could not locate repository root for static AI config assertions");
    }

    private AuralisProperties.Ai aiProperties(AuralisProperties.Defaults defaults, long overviewTimeoutMillis,
                                              String estimatorMode) {
        return aiProperties(defaults, overviewTimeoutMillis, 240_000L, estimatorMode);
    }

    private AuralisProperties.Ai aiProperties(AuralisProperties.Defaults defaults, long overviewTimeoutMillis,
                                              long overviewTaskTimeoutMillis) {
        return aiProperties(defaults, overviewTimeoutMillis, overviewTaskTimeoutMillis, "legacy-bytes");
    }

    private AuralisProperties.Ai aiProperties(AuralisProperties.Defaults defaults, long overviewTimeoutMillis,
                                              long overviewTaskTimeoutMillis, String estimatorMode) {
        return new AuralisProperties.Ai(false, "test-key", "DEEPSEEK", defaults,
                3_000L, 10_000L, overviewTimeoutMillis, overviewTaskTimeoutMillis, 12_000, 8, 5_242_880L,
                32, 32_768L,
                3_000L, 10_000L, 3, 1_048_576L, java.util.List.of(), false,
                1_000L, 300_000L, 3, new AuralisProperties.Limits(
                        4, 2, 100_000, 200_000, 2_000_000, 300_000,
                        10_000, 4096, 2, 32_000, 0, 524_288, 512, 16_777_216),
                true, true, estimatorMode, java.util.List.of(),
                AuralisProperties.OverviewLimits.withoutAdditionalCaps(), 3);
    }
}
