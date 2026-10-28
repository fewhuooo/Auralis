package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.AiCredentialEntity;
import com.auralis.app.ai.internal.persistence.AiCredentialRepository;
import com.auralis.app.ai.internal.security.AiKeyCipher;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.shared.error.DomainException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Service
public class AiSettingsService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AiSettingsService.class);
    private static final String SERVER_MANAGED_EMBEDDING_MARKER = "server-managed";

    private final AiCredentialRepository credentialRepository;
    private final AiKeyCipher keyCipher;
    private final ProviderEndpointPolicy endpointPolicy;
    private final AuralisProperties properties;

    public AiSettingsService(
            AiCredentialRepository credentialRepository,
            AiKeyCipher keyCipher,
            ProviderEndpointPolicy endpointPolicy,
            AuralisProperties properties) {
        this.credentialRepository = credentialRepository;
        this.keyCipher = keyCipher;
        this.endpointPolicy = endpointPolicy;
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
        java.net.URI validatedBaseUrl = validate(command);
        String baseUrl = validatedBaseUrl.toString();
        AiCredentialEntity entity = credentialRepository
                .findByUserIdAndProvider(userId, command.provider())
                .orElseGet(() -> new AiCredentialEntity(
                        UUID.randomUUID(), userId, command.provider(),
                        baseUrl, command.chatModel(), SERVER_MANAGED_EMBEDDING_MARKER, null));
        String encryptedApiKey = entity.getEncryptedApiKey();
        if (command.apiKey() != null && !command.apiKey().isBlank()) {
            encryptedApiKey = keyCipher.encrypt(command.apiKey().trim());
        }
        if (encryptedApiKey == null || encryptedApiKey.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "apiKey is required when configuring a provider");
        }
        entity.updateChatSettings(baseUrl, command.chatModel(), encryptedApiKey);
        return toView(credentialRepository.save(entity));
    }

    @Transactional(readOnly = true)
    public ResolvedSettings resolve(UUID userId, AiProviderType provider) {
        AiCredentialEntity entity = credentialRepository.findByUserIdAndProvider(userId, provider).orElse(null);
        if (entity != null && entity.getEncryptedApiKey() != null && !entity.getEncryptedApiKey().isBlank()) {
            LOGGER.info("AI_SETTINGS_RESOLVED userId={} provider={} source=BYOK endpointHost={} chatModel={}",
                    userId, provider, safeHost(entity.getBaseUrl()), entity.getChatModel());
            return new ResolvedSettings(
                    entity.getProvider(),
                    entity.getChatModel(),
                    new AiCredential(entity.getBaseUrl(), keyCipher.decrypt(entity.getEncryptedApiKey())),
                    AiCredentialSource.USER_SUPPLIED);
        }

        AuralisProperties.Provider defaults = defaultProvider(provider);
        if (defaults == null || defaults.apiKey() == null || defaults.apiKey().isBlank()) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is not configured");
        }

        LOGGER.info("AI_SETTINGS_RESOLVED userId={} provider={} source=ENV_DEFAULT endpointHost={} chatModel={}",
                userId, provider, safeHost(defaults.baseUrl()), defaults.chatModel());
        return new ResolvedSettings(
                provider,
                defaults.chatModel(),
                new AiCredential(defaults.baseUrl(), defaults.apiKey()), AiCredentialSource.PLATFORM);
    }

    /**
     * Returns a stable identity for queued work without decrypting a saved BYOK credential
     * or constructing an {@link AiCredential}. The fingerprint is internal job metadata;
     * it must never be returned by an API or included in logs.
     */
    @Transactional(readOnly = true)
    public JobProfileMetadata jobProfileMetadata(UUID userId, AiProviderType provider) {
        AiCredentialEntity entity = credentialRepository.findByUserIdAndProvider(userId, provider).orElse(null);
        if (entity != null && !blank(entity.getEncryptedApiKey())) {
            return metadataForSavedCredential(entity);
        }

        AuralisProperties.Provider defaults = defaultProvider(provider);
        if (defaults == null || blank(defaults.apiKey())) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is not configured");
        }
        return metadataForDefault(provider, defaults);
    }

    @Transactional(readOnly = true)
    public JobResolvedSettings resolveJobSettings(UUID userId, AiProviderType provider, String expectedFingerprint) {
        AiCredentialEntity entity = credentialRepository.findByUserIdAndProvider(userId, provider).orElse(null);
        if (entity != null && !blank(entity.getEncryptedApiKey())) {
            JobProfileMetadata metadata = metadataForSavedCredential(entity);
            requireExpectedFingerprint(expectedFingerprint, metadata);
            ResolvedSettings resolved = new ResolvedSettings(entity.getProvider(), entity.getChatModel(),
                    new AiCredential(entity.getBaseUrl(), keyCipher.decrypt(entity.getEncryptedApiKey())),
                    AiCredentialSource.USER_SUPPLIED);
            return new JobResolvedSettings(metadata, resolved);
        }
        AuralisProperties.Provider defaults = defaultProvider(provider);
        if (defaults == null || blank(defaults.apiKey())) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is not configured");
        }
        JobProfileMetadata metadata = metadataForDefault(provider, defaults);
        requireExpectedFingerprint(expectedFingerprint, metadata);
        ResolvedSettings resolved = new ResolvedSettings(provider, defaults.chatModel(),
                new AiCredential(defaults.baseUrl(), defaults.apiKey()), AiCredentialSource.PLATFORM);
        return new JobResolvedSettings(metadata, resolved);
    }

    public boolean matchesResolvedSettings(JobProfileMetadata metadata, ResolvedSettings settings) {
        if (metadata == null || settings == null || settings.credential() == null) return false;
        return metadata.provider() == settings.provider()
                && metadata.source() == settings.source()
                && Objects.equals(metadata.chatModel(), Objects.toString(settings.chatModel(), ""))
                && Objects.equals(metadata.normalizedEndpoint(), normalizeEndpoint(settings.credential().baseUrl()));
    }

    @Transactional(readOnly = true)
    public ResolvedSettings requireSavedByok(UUID userId, AiProviderType provider) {
        AiCredentialEntity entity = credentialRepository.findByUserIdAndProvider(userId, provider)
                .filter(saved -> saved.getEncryptedApiKey() != null && !saved.getEncryptedApiKey().isBlank())
                .orElseThrow(() -> new DomainException("MODEL_UNAVAILABLE", "Saved AI provider settings are required"));
        LOGGER.info("AI_SETTINGS_RESOLVED userId={} provider={} source=BYOK endpointHost={} chatModel={}",
                userId, provider, safeHost(entity.getBaseUrl()), entity.getChatModel());
        return new ResolvedSettings(entity.getProvider(), entity.getChatModel(),
                new AiCredential(entity.getBaseUrl(), keyCipher.decrypt(entity.getEncryptedApiKey())),
                AiCredentialSource.USER_SUPPLIED);
    }

    @Transactional(readOnly = true)
    public ResolvedSettings resolveServerManagedEmbedding() {
        AuralisProperties.Provider defaults = defaultProvider(AiProviderType.SILICONFLOW);
        if (defaults == null || blank(defaults.baseUrl()) || blank(defaults.apiKey())
                || blank(defaults.embeddingModel())) {
            throw new DomainException("MODEL_UNAVAILABLE", "Server-managed embedding provider is not configured");
        }
        LOGGER.info("AI_EMBEDDING_SETTINGS_RESOLVED provider={} source=SERVER_DEFAULT endpointHost={} model={}",
                AiProviderType.SILICONFLOW, safeHost(defaults.baseUrl()), defaults.embeddingModel());
        return new ResolvedSettings(AiProviderType.SILICONFLOW, null,
                new AiCredential(defaults.baseUrl(), defaults.apiKey(), defaults.embeddingModel()),
                AiCredentialSource.PLATFORM);
    }

    private AuralisProperties.Provider defaultProvider(AiProviderType provider) {
        if (properties == null || properties.ai() == null || properties.ai().defaults() == null) {
            return null;
        }
        return switch (provider) {
            case DEEPSEEK -> properties.ai().defaults().deepseek();
            case OPENAI_COMPATIBLE -> properties.ai().defaults().openaiCompatible();
            case SILICONFLOW -> properties.ai().defaults().siliconflow();
        };
    }

    private java.net.URI validate(AiSettingsCommand command) {
        if (command.baseUrl() == null || command.baseUrl().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "baseUrl is required");
        }
        if (command.chatModel() == null || command.chatModel().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "chatModel is required");
        }
        return endpointPolicy.validate(command.provider(), command.baseUrl());
    }

    private AiSettingsView toView(AiCredentialEntity entity) {
        return new AiSettingsView(
                entity.getId(),
                entity.getProvider(),
                entity.getBaseUrl(),
                entity.getChatModel(),
                entity.getEncryptedApiKey() != null && !entity.getEncryptedApiKey().isBlank(),
                entity.getUpdatedAt());
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private String safeHost(String baseUrl) {
        try {
            String host = java.net.URI.create(baseUrl == null ? "" : baseUrl.trim()).getHost();
            return host == null || host.isBlank() ? "<unknown>" : host;
        } catch (IllegalArgumentException exception) {
            return "<invalid>";
        }
    }

    private String normalizeEndpoint(String baseUrl) {
        try {
            java.net.URI uri = java.net.URI.create(Objects.toString(baseUrl, "").trim()).normalize();
            return Objects.toString(uri.getScheme(), "").toLowerCase(Locale.ROOT) + "://"
                    + Objects.toString(uri.getHost(), "").toLowerCase(Locale.ROOT)
                    + (uri.getPort() < 0 ? "" : ":" + uri.getPort())
                    + Objects.toString(uri.getRawPath(), "").replaceAll("/+$", "");
        } catch (IllegalArgumentException exception) {
            return Objects.toString(baseUrl, "").trim();
        }
    }

    private JobProfileMetadata metadataForSavedCredential(AiCredentialEntity entity) {
        String endpoint = normalizeEndpoint(entity.getBaseUrl());
        String model = Objects.toString(entity.getChatModel(), "");
        AiCredentialSource source = AiCredentialSource.USER_SUPPLIED;
        return new JobProfileMetadata(entity.getProvider(), model, endpoint, source,
                fingerprint(entity.getProvider(), model, endpoint, source, sha256(entity.getEncryptedApiKey())));
    }

    private JobProfileMetadata metadataForDefault(AiProviderType provider, AuralisProperties.Provider defaults) {
        String endpoint = normalizeEndpoint(defaults.baseUrl());
        String model = Objects.toString(defaults.chatModel(), "");
        AiCredentialSource source = AiCredentialSource.PLATFORM;
        return new JobProfileMetadata(provider, model, endpoint, source,
                fingerprint(provider, model, endpoint, source, sha256(defaults.apiKey())));
    }

    private void requireExpectedFingerprint(String expectedFingerprint, JobProfileMetadata metadata) {
        if (expectedFingerprint == null || !expectedFingerprint.equals(metadata.fingerprint())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview provider profile changed after enqueue");
        }
    }

    private String fingerprint(AiProviderType provider, String model, String endpoint,
                               AiCredentialSource source, String secretIdentity) {
        return sha256(Objects.toString(provider, "") + "|" + source.name() + "|" + endpoint
                + "|" + model + "|" + secretIdentity);
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record ResolvedSettings(AiProviderType provider, String chatModel, AiCredential credential,
                                   AiCredentialSource source) {
        public ResolvedSettings {
            java.util.Objects.requireNonNull(source, "source");
        }
    }

    public record JobProfileMetadata(AiProviderType provider, String chatModel, String normalizedEndpoint,
                                     AiCredentialSource source, String fingerprint) { }

    public record JobResolvedSettings(JobProfileMetadata metadata, ResolvedSettings settings) { }
}
