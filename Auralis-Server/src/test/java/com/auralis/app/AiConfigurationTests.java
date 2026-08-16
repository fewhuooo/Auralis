package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
class AiConfigurationTests {

    @Autowired
    private AuralisProperties properties;

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
    }
}
