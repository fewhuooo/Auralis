package com.auralis.app;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.internal.persistence.AiCredentialEntity;
import com.auralis.app.ai.internal.persistence.AiCredentialRepository;
import com.auralis.app.ai.internal.security.AiKeyCipher;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSettingsByokResolutionTests {

    @Mock
    private AiCredentialRepository credentialRepository;

    @Mock
    private ProviderEndpointPolicy endpointPolicy;

    @Mock
    private AuralisProperties properties;

    @Test
    void resolvesMostRecentlyUpdatedByokProviderWhenCompatibleRequested() {
        UUID userId = UUID.randomUUID();
        AiKeyCipher keyCipher = new AiKeyCipher("0123456789abcdef0123456789abcdef");
        AiSettingsService service = new AiSettingsService(credentialRepository, keyCipher, endpointPolicy, properties);
        AiCredentialEntity siliconFlow = new AiCredentialEntity(
                UUID.randomUUID(),
                userId,
                AiProviderType.SILICONFLOW,
                "https://api.siliconflow.cn/v1",
                "Qwen/Qwen2.5-7B-Instruct",
                keyCipher.encrypt("sf-secret-key"));
        AiCredentialEntity olderDeepSeek = new AiCredentialEntity(
                UUID.randomUUID(),
                userId,
                AiProviderType.DEEPSEEK,
                "https://api.deepseek.com/v1",
                "deepseek-chat",
                keyCipher.encrypt("ds-secret-key"));
        when(credentialRepository.findAllByUserIdOrderByUpdatedAtDesc(userId))
                .thenReturn(List.of(siliconFlow, olderDeepSeek));

        AiSettingsService.ResolvedSettings resolved = service.resolve(userId, AiProviderType.OPENAI_COMPATIBLE);

        assertThat(resolved.source()).isEqualTo(AiCredentialSource.USER_SUPPLIED);
        assertThat(resolved.provider()).isEqualTo(AiProviderType.SILICONFLOW);
        assertThat(resolved.chatModel()).isEqualTo("Qwen/Qwen2.5-7B-Instruct");
        assertThat(resolved.credential().baseUrl()).isEqualTo("https://api.siliconflow.cn/v1");
        assertThat(resolved.credential().apiKey()).isEqualTo("sf-secret-key");
    }
}
