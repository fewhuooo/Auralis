package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.TestPropertySource;

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
                        "ingestionEmbeddingBatchMaxUtf8Bytes");
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
        assertThat(properties.ai().limits().overviewMaxCalls()).isEqualTo(24);
        assertThat(properties.ai().limits().overviewTaskTokens()).isEqualTo(524_288L);
        assertThat(properties.ai().limits().ingestionMaxCalls()).isEqualTo(512);
        assertThat(properties.ai().limits().ingestionTaskTokens()).isEqualTo(16_777_216L);
        assertThat(environment.getProperty("auralis.ai.defaults.deepseek.api-key"))
                .isEqualTo("env-chat-key");
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
    void rejectsOverviewResponseTimeoutOutsideSixtyToOneHundredTwentySeconds() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var defaults = new AuralisProperties.Defaults(null, null, null);

        assertThat(validator.validate(aiProperties(defaults, 59_999L)))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewResponseTimeoutMillis"));
        assertThat(validator.validate(aiProperties(defaults, 120_001L)))
                .anyMatch(error -> error.getPropertyPath().toString().equals("overviewResponseTimeoutMillis"));
    }

    @Test
    void requiresTaskDeadlineAndEmbeddingBatchLimitsToStayWithinSafeBounds() {
        var validator = Validation.buildDefaultValidatorFactory().getValidator();
        var properties = aiProperties(new AuralisProperties.Defaults(null, null, null), 120_000L);

        assertThat(validator.validate(properties))
                .noneMatch(error -> error.getPropertyPath().toString().equals("overviewTaskTimeoutMillis"));
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

        assertThat(validator.validate(invalidHeartbeat))
                .anyMatch(error -> error.getPropertyPath().toString().equals("heartbeatWindowSafe"));
        assertThat(validator.validate(invalidQuota))
                .anyMatch(error -> error.getPropertyPath().toString().equals("quotaWindowSafe"));
    }

    private AuralisProperties.Ai aiProperties(AuralisProperties.Defaults defaults, long overviewTimeoutMillis) {
        return new AuralisProperties.Ai(false, "test-key", "DEEPSEEK", defaults,
                3_000L, 10_000L, overviewTimeoutMillis, 240_000L, 12_000, 8, 5_242_880L,
                32, 32_768L,
                3_000L, 10_000L, 3, 1_048_576L, java.util.List.of(), false,
                1_000L, 300_000L, 3, new AuralisProperties.Limits(
                        4, 2, 100_000, 200_000, 2_000_000, 300_000,
                        10_000, 4096, 2, 32_000, 24, 524_288, 512, 16_777_216));
    }
}
