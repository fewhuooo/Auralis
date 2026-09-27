package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.util.unit.DataSize;
import org.springframework.core.env.Environment;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
class ConfigurationTests {
    @Autowired
    private AuralisProperties properties;

    @Autowired
    private Environment environment;

    @Test
    void bindsThePhaseZeroUploadLimit() {
        assertThat(properties.upload().maxFileSizeBytes()).isEqualTo(52_428_800L);
    }

    @Test
    void disablesOpenInViewByDefault() {
        assertThat(environment.getProperty("spring.jpa.open-in-view", Boolean.class)).isFalse();
    }

    @Test
    void configuresMultipartLimitsForAvatarUploads() {
        assertThat(environment.getProperty("spring.servlet.multipart.max-file-size", DataSize.class))
                .isEqualTo(DataSize.ofMegabytes(5));
        assertThat(environment.getProperty("spring.servlet.multipart.max-request-size", DataSize.class))
                .isEqualTo(DataSize.ofMegabytes(6));
    }
}
