package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.AiCredentialEntity;
import com.auralis.app.ai.internal.persistence.AiCredentialRepository;
import com.auralis.app.ai.internal.security.AiKeyCipher;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class AiSettingsService {

    private final AiCredentialRepository credentialRepository;
    private final AiKeyCipher keyCipher;
    private final AuralisProperties properties;

    public AiSettingsService(
            AiCredentialRepository credentialRepository,
            AiKeyCipher keyCipher,
            AuralisProperties properties) {
        this.credentialRepository = credentialRepository;
        this.keyCipher = keyCipher;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public List<AiSettingsView> list(UUID userId) {
        return credentialRepository.findAllByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(this::toView)
                .toList();
    }

    @Transactional
    public AiSettingsView upsert(UUID userId, AiSettingsCommand command) {
        validate(command);
        AiCredentialEntity entity = credentialRepository
                .findByUserIdAndProvider(userId, command.provider())
                .orElseGet(() -> new AiCredentialEntity(
                        UUID.randomUUID(), userId, command.provider(),
                        command.baseUrl(), command.chatModel(), command.embeddingModel(), null));
        String encryptedApiKey = entity.getEncryptedApiKey();
        if (command.apiKey() != null && !command.apiKey().isBlank()) {
            encryptedApiKey = keyCipher.encrypt(command.apiKey().trim());
        }
        if (encryptedApiKey == null || encryptedApiKey.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "apiKey is required when configuring a provider");
        }
        entity.update(command.baseUrl(), command.chatModel(), command.embeddingModel(), encryptedApiKey);
        return toView(credentialRepository.save(entity));
    }

    @Transactional(readOnly = true)
    public ResolvedSettings resolve(UUID userId, AiProviderType provider) {
        AiCredentialEntity entity = credentialRepository.findByUserIdAndProvider(userId, provider)
                .orElseThrow(() -> new DomainException("MODEL_UNAVAILABLE", "AI provider is not configured"));
        if (entity.getEncryptedApiKey() == null || entity.getEncryptedApiKey().isBlank()) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is not configured");
        }
        return new ResolvedSettings(
                entity.getProvider(),
                entity.getChatModel(),
                new AiCredential(entity.getBaseUrl(), keyCipher.decrypt(entity.getEncryptedApiKey()), entity.getEmbeddingModel()));
    }

    private void validate(AiSettingsCommand command) {
        if (command.baseUrl() == null || command.baseUrl().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "baseUrl is required");
        }
        if (command.chatModel() == null || command.chatModel().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "chatModel is required");
        }
        if (command.embeddingModel() == null || command.embeddingModel().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "embeddingModel is required");
        }
        try {
            java.net.URI uri = java.net.URI.create(command.baseUrl().trim());
            boolean testEnvironment = properties == null
                    || "test".equalsIgnoreCase(properties.environment())
                    || "local".equalsIgnoreCase(properties.environment());
            if (!"https".equalsIgnoreCase(uri.getScheme()) && !(testEnvironment && "http".equalsIgnoreCase(uri.getScheme()))) {
                throw new DomainException("VALIDATION_FAILED", "baseUrl must use HTTPS");
            }
            if (uri.getHost() == null) {
                throw new DomainException("VALIDATION_FAILED", "baseUrl must include a host");
            }
        } catch (IllegalArgumentException exception) {
            throw new DomainException("VALIDATION_FAILED", "baseUrl is invalid");
        }
    }

    private AiSettingsView toView(AiCredentialEntity entity) {
        return new AiSettingsView(
                entity.getId(),
                entity.getProvider(),
                entity.getBaseUrl(),
                entity.getChatModel(),
                entity.getEmbeddingModel(),
                entity.getEncryptedApiKey() != null && !entity.getEncryptedApiKey().isBlank(),
                entity.getUpdatedAt());
    }

    public record ResolvedSettings(AiProviderType provider, String chatModel, AiCredential credential) {
    }
}
