package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.AiCredentialEntity;
import com.auralis.app.ai.internal.persistence.AiCredentialRepository;
import com.auralis.app.ai.internal.security.AiKeyCipher;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.ai.usage.AiCredentialSource;
import org.junit.jupiter.api.Test;
import com.auralis.app.shared.error.DomainException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiSettingsJobProfileMetadataTests {
    @Test
    void savedByokMetadataIsStableAndDoesNotDecryptOrExposeCiphertext() {
        UUID userId = UUID.randomUUID();
        AiCredentialEntity credential = new AiCredentialEntity(UUID.randomUUID(), userId,
                AiProviderType.DEEPSEEK, "https://api.deepseek.com/v1/", "deepseek-chat",
                "server-managed", "ciphertext-one");
        AiCredentialRepository repository = mock(AiCredentialRepository.class);
        AiKeyCipher cipher = mock(AiKeyCipher.class);
        when(repository.findByUserIdAndProvider(userId, AiProviderType.DEEPSEEK))
                .thenReturn(Optional.of(credential));
        AiSettingsService service = new AiSettingsService(repository, cipher,
                mock(ProviderEndpointPolicy.class), mock(AuralisProperties.class));

        AiSettingsService.JobProfileMetadata first = service.jobProfileMetadata(userId, AiProviderType.DEEPSEEK);
        AiSettingsService.JobProfileMetadata second = service.jobProfileMetadata(userId, AiProviderType.DEEPSEEK);

        assertThat(first).isEqualTo(second);
        assertThat(first.provider()).isEqualTo(AiProviderType.DEEPSEEK);
        assertThat(first.source()).isEqualTo(AiCredentialSource.USER_SUPPLIED);
        assertThat(first.normalizedEndpoint()).isEqualTo("https://api.deepseek.com/v1");
        assertThat(first.fingerprint()).doesNotContain("ciphertext-one");
        assertThat(service.matchesResolvedSettings(first, new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-chat", new AiCredential("https://api.deepseek.com/v1", "resolved-key"),
                AiCredentialSource.USER_SUPPLIED))).isTrue();
        when(cipher.decrypt("ciphertext-one")).thenReturn("resolved-secret");
        AiSettingsService.JobResolvedSettings resolved = service.resolveJobSettings(userId, AiProviderType.DEEPSEEK,
                first.fingerprint());
        assertThat(resolved.metadata()).isEqualTo(first);
        assertThat(resolved.settings().credential().apiKey()).isEqualTo("resolved-secret");
        credential.updateChatSettings("https://api.deepseek.com/v1/", "deepseek-chat", "ciphertext-two");
        assertThat(service.jobProfileMetadata(userId, AiProviderType.DEEPSEEK).fingerprint())
                .isNotEqualTo(first.fingerprint());
        assertThatThrownBy(() -> service.resolveJobSettings(userId, AiProviderType.DEEPSEEK, first.fingerprint()))
                .isInstanceOf(DomainException.class);
        verify(cipher).decrypt("ciphertext-one");
        verify(cipher, never()).decrypt("ciphertext-two");
    }
}
