package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.util.ClassUtils;
import com.auralis.app.shared.config.AuralisProperties;

import static org.assertj.core.api.Assertions.assertThat;

class AiUsageGuardTests {

    @Test
    void exposesPersistentUsageGuardEntryPoint() {
        ClassLoader loader = getClass().getClassLoader();
        assertThat(ClassUtils.isPresent("com.auralis.app.ai.usage.AiInvocationGateway", loader)).isTrue();
        assertThat(ClassUtils.isPresent("com.auralis.app.ai.usage.AiUsageGuard", loader)).isTrue();
        assertThat(ClassUtils.isPresent("com.auralis.app.ai.usage.AiUsageQueryService", loader)).isTrue();
    }

    @Test
    void exposesConfigurablePersistentUsageLimits() {
        assertThat(java.util.Arrays.stream(AuralisProperties.Ai.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .contains("limits");
    }
}
