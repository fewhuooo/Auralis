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
        assertThat(properties.ai().ingestionMaxBytes()).isEqualTo(5_242_880L);
        assertThat(properties.ai().urlMaxRedirects()).isEqualTo(3);
        assertThat(properties.ai().providerMaxResponseBytes()).isEqualTo(1_048_576L);
        assertThat(properties.ai().allowedProviderHosts())
                .containsExactly("api.deepseek.com", "api.openai.com", "api.siliconflow.cn");
        assertThat(properties.ai().ingestionWorkerEnabled()).isTrue();
        assertThat(properties.ai().ingestionPollDelayMillis()).isEqualTo(1_000L);
        assertThat(properties.ai().ingestionLeaseMillis()).isEqualTo(300_000L);
        assertThat(properties.ai().ingestionMaxAttempts()).isEqualTo(3);
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

    private AuralisProperties.Ai aiProperties(AuralisProperties.Defaults defaults, long overviewTimeoutMillis) {
        return new AuralisProperties.Ai(false, "test-key", "DEEPSEEK", defaults,
                3_000L, 10_000L, overviewTimeoutMillis, 12_000, 8, 5_242_880L,
                3_000L, 10_000L, 3, 1_048_576L, java.util.List.of(), false,
                1_000L, 300_000L, 3);
    }
}
