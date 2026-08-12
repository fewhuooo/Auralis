package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
class ConfigurationTests {
    @Autowired
    private AuralisProperties properties;

    @Test
    void bindsThePhaseZeroUploadLimit() {
        assertThat(properties.upload().maxFileSizeBytes()).isEqualTo(52_428_800L);
    }
}
