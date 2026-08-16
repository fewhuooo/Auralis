package com.auralis.app.ai.internal.persistence;

import com.auralis.app.ai.AiProviderType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ai_credentials", uniqueConstraints = @UniqueConstraint(
        name = "uq_ai_credentials_user_provider", columnNames = {"user_id", "provider"}))
public class AiCredentialEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private AiProviderType provider;

    @Column(name = "base_url", nullable = false, length = 2048)
    private String baseUrl;

    @Column(name = "chat_model", length = 240)
    private String chatModel;

    @Column(name = "embedding_model", length = 240)
    private String embeddingModel;

    @Column(name = "api_key_ciphertext", columnDefinition = "TEXT")
    private String encryptedApiKey;

    @Column(name = "key_version", nullable = false)
    private int keyVersion = 1;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AiCredentialEntity() {
    }

    public AiCredentialEntity(
            UUID id,
            UUID userId,
            AiProviderType provider,
            String baseUrl,
            String chatModel,
            String embeddingModel,
            String encryptedApiKey) {
        this.id = id;
        this.userId = userId;
        this.provider = provider;
        this.baseUrl = baseUrl;
        this.chatModel = chatModel;
        this.embeddingModel = embeddingModel;
        this.encryptedApiKey = encryptedApiKey;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public AiProviderType getProvider() { return provider; }
    public String getBaseUrl() { return baseUrl; }
    public String getChatModel() { return chatModel; }
    public String getEmbeddingModel() { return embeddingModel; }
    public String getEncryptedApiKey() { return encryptedApiKey; }
    public int getKeyVersion() { return keyVersion; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void update(String baseUrl, String chatModel, String embeddingModel, String encryptedApiKey) {
        this.baseUrl = baseUrl;
        this.chatModel = chatModel;
        this.embeddingModel = embeddingModel;
        this.encryptedApiKey = encryptedApiKey;
    }
}
