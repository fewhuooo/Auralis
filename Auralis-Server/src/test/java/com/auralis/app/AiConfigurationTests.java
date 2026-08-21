package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
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
    }

    @Test
    void doesNotExposeEnvProviderKeyInConfigurationToString() {
        AuralisProperties.Provider provider = new AuralisProperties.Provider(
                "https://provider.test", "chat-model", "embedding-model", "env-secret");

        assertThat(provider.toString()).doesNotContain("env-secret");
        assertThat(provider.toString()).contains("<redacted>");
    }
}
