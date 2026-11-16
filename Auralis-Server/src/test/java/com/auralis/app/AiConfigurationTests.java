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
        "AURALIS_AI_GENERATION_BASE_URL=https://generation.test/v1",
        "AURALIS_AI_GENERATION_MODEL=chat-model",
        "AURALIS_AI_GENERATION_API_KEY=env-chat-key",
        "AURALIS_AI_GENERATION_CONTEXT_TOKENS=1048576",
        "AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS=393216",
        "AURALIS_AI_EMBEDDING_BASE_URL=https://embedding.test/v1",
        "AURALIS_AI_EMBEDDING_MODEL=embedding-model",
        "AURALIS_AI_EMBEDDING_API_KEY=env-embedding-key"
})
class AiConfigurationTests {

    @Test
    void declaresOverviewTaskAndEmbeddingBatchSafetyLimits() {
        assertThat(java.util.Arrays.stream(AuralisProperties.Ai.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .contains("overviewTaskTimeoutMillis", "ingestionEmbeddingBatchMaxItems",
                        "ingestionEmbeddingBatchMaxUtf8Bytes");
    }

    @Autowired
    private AuralisProperties properties;

    @Autowired
    private Environment environment;

    @Test
    void bindsSafeLocalAiDefaultsAndLimits() {
        assertThat(properties.ai().enabled()).isFalse();
        assertThat(properties.ai().maxPromptChars()).isEqualTo(12_000);
        assertThat(properties.ai().providerConnectTimeoutMillis()).isEqualTo(3_000L);
        assertThat(properties.ai().requestTimeoutMillis()).isEqualTo(10_000L);
        assertThat(properties.ai().overviewResponseTimeoutMillis()).isEqualTo(120_000L);
        assertThat(properties.ai().overviewTaskTimeoutMillis()).isEqualTo(240_000L);
        assertThat(properties.ai().shadowTokenEstimateEnabled()).isTrue();
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
        assertThat(properties.ai().limits().chatTaskTokens()).isEqualTo(32_000L);
        assertThat(properties.ai().limits().overviewMaxCalls()).isZero();
        assertThat(properties.ai().limits().overviewTaskTokens()).isEqualTo(524_288L);
        assertThat(properties.ai().limits().ingestionMaxCalls()).isEqualTo(512);
        assertThat(properties.ai().limits().ingestionTaskTokens()).isEqualTo(16_777_216L);
        assertThat(environment.getProperty("auralis.ai.thinking-enabled", Boolean.class, false)).isFalse();
        assertThat(properties.ai().generation()).isEqualTo(new AuralisProperties.GenerationEndpoint(
                "https://generation.test/v1", "chat-model", "env-chat-key", 1_048_576, 393_216));
        assertThat(properties.ai().embedding()).isEqualTo(new AuralisProperties.ModelEndpoint(
                "https://embedding.test/v1", "embedding-model", "env-embedding-key"));
    }

    @Test
    void doesNotExposeEnvProviderKeyInConfigurationToString() {
        AuralisProperties.ModelEndpoint provider = new AuralisProperties.ModelEndpoint(
                "https://provider.test", "chat-model", "env-secret");

        assertThat(provider.toString()).doesNotContain("env-secret");
        assertThat(provider.toString()).contains("<redacted>");
        assertThat(properties.ai().generation().toString()).doesNotContain("env-chat-key");
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
        values.put("auralis.ai.overview-limits.max-chapters", "200");
        values.put("auralis.ai.overview-limits.max-sections", "2000");
        values.put("auralis.ai.overview-limits.max-prose-chars", "200000");
        values.put("auralis.ai.overview-limits.max-guide-items", "100");
        values.put("auralis.ai.overview-limits.max-source-ids-per-section", "1000");
        values.put("auralis.ai.overview-limits.max-provenance-sections", "2000");
        values.put("auralis.ai.overview-limits.max-provenance-refs-per-section", "1000");
        values.put("auralis.ai.overview-limits.max-provenance-refs", "100000");
        values.put("auralis.ai.overview-limits.max-provenance-locations", "100000");
        values.put("auralis.ai.overview-limits.max-input-snapshot-chars", "5000000");
        values.put("auralis.ai.overview-limits.max-source-manifest-chars", "6000000");
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
                        2_000_000,
                        5_000_000, 6_000_000, 500, 5_000));
    }

    @Test
    void bindsOverviewModelCapacityFromSpringEnvironmentListSyntax() {
        var source = new SystemEnvironmentPropertySource("overview-capacity-systemEnvironment", java.util.Map.of(
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
        List<String> variables = List.of(
                "AURALIS_AI_OVERVIEW_MAX_PROMPT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_REQUEST_BYTES",
                "AURALIS_AI_OVERVIEW_MAX_INPUT_TOKENS",
                "AURALIS_AI_OVERVIEW_MAX_OUTPUT_TOKENS",
                "AURALIS_AI_OVERVIEW_MAX_RESPONSE_BYTES",
                "AURALIS_AI_OVERVIEW_MAX_RESULT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_INPUT_SNAPSHOT_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_SOURCE_MANIFEST_CHARS",
                "AURALIS_AI_OVERVIEW_MAX_SOURCES",
                "AURALIS_AI_OVERVIEW_MAX_TITLE_CHARS");

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
    void rejectsOverviewResponseTimeoutBelowSixtySecondsAndAllowsLongerCalls() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();

        assertThat(validator.validate(aiProperties(59_999L)))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewResponseTimeoutMillis"));
        assertThat(validator.validate(aiProperties(120_001L)))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewResponseTimeoutMillis"));
    }

    @Test
    void requiresTaskDeadlineAndEmbeddingBatchLimitsToStayWithinSafeBounds() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var properties = aiProperties(120_000L);

        assertThat(validator.validate(properties))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
    }

    @Test
    void acceptsZeroTaskTimeoutToDisableDirectRequestDeadlineButRejectsNegativeValues() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();

        assertThat(validator.validate(aiProperties(120_000L, 0)))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
        assertThat(validator.validate(aiProperties(120_000L, -1)))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
    }

    @Test
    void rejectsUnsafeUsageHeartbeatAndQuotaRelationships() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var invalidHeartbeat = new AuralisProperties.Limits(
                4, 2, 100_000, 200_000, 2_000_000, 300_000, 100_001,
                4096, 32_000, 24, 524_288, 512, 16_777_216);
        var invalidQuota = new AuralisProperties.Limits(
                4, 2, 300_000, 200_000, 2_000_000, 300_000, 10_000,
                4096, 32_000, 24, 524_288, 512, 16_777_216);
        var highOverviewCalls = new AuralisProperties.Limits(
                4, 2, 100_000, 200_000, 2_000_000, 300_000, 10_000,
                4096, 32_000, 2_000, 524_288, 512, 16_777_216);

        assertThat(validator.validate(invalidHeartbeat))
                .anyMatch(error -> error.getPropertyPath().toString().equals("heartbeatWindowSafe"));
        assertThat(validator.validate(invalidQuota))
                .anyMatch(error -> error.getPropertyPath().toString().equals("quotaWindowSafe"));
        assertThat(validator.validate(highOverviewCalls))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewMaxCalls"));
    }

    private AuralisProperties.Ai aiProperties(long overviewTimeoutMillis) {
        return aiProperties(overviewTimeoutMillis, 240_000L);
    }

    private Path repositoryRoot() throws IOException {
        Path candidate = Path.of("").toAbsolutePath();
        while (candidate != null) {
            if (Files.isRegularFile(candidate.resolve("docker-compose.yml"))) return candidate;
            candidate = candidate.getParent();
        }
        throw new IOException("Could not locate repository root for static AI config assertions");
    }

    private AuralisProperties.Ai aiProperties(long overviewTimeoutMillis,
                                              long overviewTaskTimeoutMillis) {
        return new AuralisProperties.Ai(false, "test-key", null, null,
                3_000L, 10_000L, overviewTimeoutMillis, overviewTaskTimeoutMillis, 12_000, 5_242_880L,
                32, 32_768L,
                3_000L, 10_000L, 3, 1_048_576L, java.util.List.of(), false,
                1_000L, 300_000L, 3, new AuralisProperties.Limits(
                        4, 2, 100_000, 200_000, 2_000_000, 300_000,
                        10_000, 4096, 32_000, 0, 524_288, 512, 16_777_216),
                true, java.util.List.of(),
                AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }
}
