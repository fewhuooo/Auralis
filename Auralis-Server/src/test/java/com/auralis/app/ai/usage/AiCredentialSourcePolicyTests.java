package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiCredential;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiCredentialSourcePolicyTests {
    @Test
    void sourceIsPartOfTheImmutableResolvedCredentialSnapshot() {
        var supplied = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK, "model",
                new AiCredential("https://provider.test/v1", "synthetic"), AiCredentialSource.USER_SUPPLIED);
        var platform = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK, "model",
                new AiCredential("https://provider.test/v1", "synthetic"), AiCredentialSource.PLATFORM);
        assertThat(supplied.source()).isEqualTo(AiCredentialSource.USER_SUPPLIED);
        assertThat(platform.source()).isEqualTo(AiCredentialSource.PLATFORM);
        assertThat(AiCredentialSource.values()).contains(AiCredentialSource.LEGACY_UNKNOWN);
    }

    @Test
    void legacyUnknownIsNotAnExecutionSource() {
        assertThat(AiCredentialSource.LEGACY_UNKNOWN).isNotEqualTo(AiCredentialSource.USER_SUPPLIED);
        assertThat(AiCredentialSource.LEGACY_UNKNOWN).isNotEqualTo(AiCredentialSource.PLATFORM);
    }
}
