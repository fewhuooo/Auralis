package com.auralis.app;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsCommand;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiSettingsView;
import com.auralis.app.ai.internal.persistence.AiCredentialEntity;
import com.auralis.app.ai.internal.persistence.AiCredentialRepository;
import com.auralis.app.ai.internal.security.AiKeyCipher;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;
import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSettingsServiceTests {

    private static final String KEY = "01234567890123456789012345678901";

    @Mock
    private AiCredentialRepository credentialRepository;

    @Mock
    private AiKeyCipher keyCipher;

    @Mock
    private ProviderEndpointPolicy endpointPolicy;

    @InjectMocks
    private AiSettingsService settingsService;

    @Test
    void upsertEncryptsApiKeyAndReturnsOnlyPresenceMetadata() {
        UUID userId = UUID.randomUUID();
        AiSettingsCommand command = new AiSettingsCommand(
                AiProviderType.DEEPSEEK,
                "https://api.deepseek.com",
                "deepseek-chat",
                "bge-m3",
                "sk-secret-value");
        when(endpointPolicy.validate(AiProviderType.DEEPSEEK, command.baseUrl()))
                .thenReturn(URI.create(command.baseUrl()));
        when(keyCipher.encrypt("sk-secret-value")).thenReturn("ciphertext");
        when(credentialRepository.findByUserIdAndProvider(userId, AiProviderType.DEEPSEEK))
                .thenReturn(Optional.empty());
        when(credentialRepository.save(any(AiCredentialEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AiSettingsView view = settingsService.upsert(userId, command);

        ArgumentCaptor<AiCredentialEntity> captor = ArgumentCaptor.forClass(AiCredentialEntity.class);
        verify(credentialRepository).save(captor.capture());
        assertThat(captor.getValue().getEncryptedApiKey()).isEqualTo("ciphertext");
        assertThat(captor.getValue().getEncryptedApiKey()).doesNotContain("sk-secret-value");
        assertThat(view.provider()).isEqualTo(AiProviderType.DEEPSEEK);
        assertThat(view.hasApiKey()).isTrue();
        assertThat(view).extracting(AiSettingsView::baseUrl, AiSettingsView::chatModel)
                .containsExactly("https://api.deepseek.com", "deepseek-chat");
    }

    @Test
    void rejectsUnsafeProviderUrlBeforeEncryptingOrPersistingApiKey() {
        AiSettingsCommand command = new AiSettingsCommand(
                AiProviderType.OPENAI_COMPATIBLE,
                "https://evil.example",
                "model",
                "embedding-model",
                "sk-secret-value");
        when(endpointPolicy.validate(AiProviderType.OPENAI_COMPATIBLE, command.baseUrl()))
                .thenThrow(new DomainException("VALIDATION_FAILED", "Provider URL is not allowed"));

        AiSettingsService service = new AiSettingsService(credentialRepository, keyCipher, endpointPolicy);

        assertThatThrownBy(() -> service.upsert(UUID.randomUUID(), command))
                .isInstanceOf(DomainException.class)
                .hasMessage("Provider URL is not allowed");
        verifyNoInteractions(keyCipher, credentialRepository);
    }
}
