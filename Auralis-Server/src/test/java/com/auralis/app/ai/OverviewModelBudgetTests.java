package com.auralis.app.ai;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OverviewModelBudgetTests {

    @Test
    void resolvesOfficialMimoCapacityOnlyForExactProviderEndpointAndModel() {
        OverviewModelBudget profile = OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://api.xiaomimimo.com/v1", "mimo-v2.6-flash", List.of());

        assertThat(profile.isTrusted()).isTrue();
        assertThat(profile.contextWindowTokens().orElseThrow()).isEqualTo(1_000_000);
        assertThat(profile.maxOutputTokens().orElseThrow()).isEqualTo(128_000);
        assertThat(profile.contextSafetyMarginTokens()).isEqualTo(8_192);
        assertThat(OverviewModelBudget.resolve(AiProviderType.DEEPSEEK,
                "https://api.xiaomimimo.com/v1", "mimo-v2.6-flash", List.of()).isTrusted()).isFalse();
        assertThat(OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://api.xiaomimimo.com.evil.test/v1", "mimo-v2.6-flash", List.of()).isTrusted()).isFalse();
        assertThat(OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://user@api.xiaomimimo.com/v1", "mimo-v2.6-flash", List.of()).isTrusted()).isFalse();
        assertThat(OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://api.xiaomimimo.com/v1?route=other", "mimo-v2.6-flash", List.of()).isTrusted()).isFalse();
        assertThat(OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://api.xiaomimimo.com/v2", "mimo-v2.6-flash", List.of()).isTrusted()).isFalse();
    }

    @Test
    void resolvesOnlyExactServerConfiguredCapacityForUnknownModels() {
        AuralisProperties.OverviewModelCapacity configured = new AuralisProperties.OverviewModelCapacity(
                "OPENAI_COMPATIBLE", "https://provider.test/v1", "private-model", 80_000, 8_000);

        OverviewModelBudget profile = OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://provider.test/v1", "private-model", List.of(configured));

        assertThat(profile.isTrusted()).isTrue();
        assertThat(profile.contextWindowTokens().orElseThrow()).isEqualTo(80_000);
        assertThat(profile.maxOutputTokens().orElseThrow()).isEqualTo(8_000);
        assertThat(OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://provider.test/v1/", "private-model", List.of(configured)).isTrusted()).isFalse();
        assertThat(OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://provider.test/v1", "other-model", List.of(configured)).isTrusted()).isFalse();
        assertThat(OverviewModelBudget.resolve(AiProviderType.DEEPSEEK,
                "https://provider.test/v1", "private-model", List.of(configured)).isTrusted()).isFalse();
    }

    @Test
    void exactServerCapacityOverridesOfficialValuesAndScalesMarginForSmallWindows() {
        AuralisProperties.OverviewModelCapacity configured = new AuralisProperties.OverviewModelCapacity(
                "OPENAI_COMPATIBLE", "https://api.xiaomimimo.com/v1",
                "mimo-v2.6-flash", 4_096, 1_024);

        OverviewModelBudget profile = OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE,
                "https://api.xiaomimimo.com/v1", "mimo-v2.6-flash", List.of(configured));

        assertThat(profile.isTrusted()).isTrue();
        assertThat(profile.contextWindowTokens().orElseThrow()).isEqualTo(4_096);
        assertThat(profile.maxOutputTokens().orElseThrow()).isEqualTo(1_024);
        assertThat(profile.contextSafetyMarginTokens()).isEqualTo(1_024);
    }
}
