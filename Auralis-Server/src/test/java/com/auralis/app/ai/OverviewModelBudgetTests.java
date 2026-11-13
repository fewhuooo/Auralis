package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverviewModelBudgetTests {
    private static final String PLATFORM_ENDPOINT = "https://api.deepseek.com";
    private static final String PLATFORM_MODEL = "deepseek-flash";

    @Test
    void resolvesConfiguredPlatformCapacityForCurrentEndpointAndModel() {
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(ai.generation()).thenReturn(new AuralisProperties.GenerationEndpoint(
                PLATFORM_ENDPOINT, PLATFORM_MODEL, "test-key", 1_048_576, 393_216));

        OverviewModelBudget profile = resolve(PLATFORM_ENDPOINT, PLATFORM_MODEL, AiCredentialSource.PLATFORM, ai);

        assertThat(profile.contextWindowTokens()).hasValue(1_048_576);
        assertThat(profile.maxOutputTokens()).hasValue(393_216);
        assertThat(resolve(PLATFORM_ENDPOINT, "deepseek-v4-flash", AiCredentialSource.PLATFORM, ai).isTrusted())
                .isFalse();
        assertThat(resolve("https://elsewhere.test", PLATFORM_MODEL, AiCredentialSource.PLATFORM, ai).isTrusted())
                .isFalse();
    }

    @Test
    void platformAndByokCapacitiesStaySeparateEvenForMatchingEndpointAndModel() {
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(ai.generation()).thenReturn(new AuralisProperties.GenerationEndpoint(
                PLATFORM_ENDPOINT, PLATFORM_MODEL, "test-key", 1_048_576, 393_216));
        assertThat(resolve(PLATFORM_ENDPOINT, PLATFORM_MODEL, AiCredentialSource.USER_SUPPLIED, ai).isTrusted())
                .isFalse();

        when(ai.overviewModelCapacities()).thenReturn(List.of(new AuralisProperties.OverviewModelCapacity(
                "OPENAI_COMPATIBLE", PLATFORM_ENDPOINT, PLATFORM_MODEL, 4_096, 1_024)));

        OverviewModelBudget byok = resolve(PLATFORM_ENDPOINT, PLATFORM_MODEL, AiCredentialSource.USER_SUPPLIED, ai);
        assertThat(byok.contextWindowTokens()).hasValue(4_096);
        assertThat(byok.maxOutputTokens()).hasValue(1_024);
        assertThat(byok.contextSafetyMarginTokens()).isEqualTo(1_024);
        assertThat(resolve(PLATFORM_ENDPOINT, PLATFORM_MODEL, AiCredentialSource.PLATFORM, ai)
                .maxOutputTokens()).hasValue(393_216);
        assertThat(resolve(PLATFORM_ENDPOINT + "/", PLATFORM_MODEL, AiCredentialSource.USER_SUPPLIED, ai)
                .isTrusted()).isFalse();
    }

    @Test
    void unconfiguredPlatformCapacityDoesNotFallBackAndInvalidPairsAreRejected() {
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(ai.generation()).thenReturn(new AuralisProperties.GenerationEndpoint(
                PLATFORM_ENDPOINT, PLATFORM_MODEL, "test-key", 0, 0));
        when(ai.overviewModelCapacities()).thenReturn(List.of(new AuralisProperties.OverviewModelCapacity(
                "OPENAI_COMPATIBLE", PLATFORM_ENDPOINT, PLATFORM_MODEL, 80_000, 8_000)));

        assertThat(resolve(PLATFORM_ENDPOINT, PLATFORM_MODEL, AiCredentialSource.PLATFORM, ai).isTrusted())
                .isFalse();
        assertThatIllegalArgumentException().isThrownBy(() -> new AuralisProperties.GenerationEndpoint(
                PLATFORM_ENDPOINT, PLATFORM_MODEL, "test-key", 0, 1_024));
        assertThatIllegalArgumentException().isThrownBy(() -> new AuralisProperties.GenerationEndpoint(
                PLATFORM_ENDPOINT, PLATFORM_MODEL, "test-key", 1_024, 4_096));
    }

    private OverviewModelBudget resolve(String endpoint, String model, AiCredentialSource source, AuralisProperties.Ai ai) {
        return OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE, endpoint, model, source, ai);
    }
}
