package com.auralis.app.ai.internal.persistence;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "messages")
public class MessageEntity {

    @Id
    private UUID id;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "message_sequence", nullable = false)
    private long messageSequence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AiMessageRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AiMessageStatus status;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(length = 160)
    private String model;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "client_request_id", length = 128)
    private String clientRequestId;

    @Column(name = "usage_json", columnDefinition = "TEXT")
    private String usageJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MessageEntity() {
    }

    public MessageEntity(
            UUID id,
            UUID conversationId,
            UUID userId,
            long messageSequence,
            AiMessageRole role,
            AiMessageStatus status,
            String content,
            String model,
            String errorCode,
            String usageJson) {
        this(id, conversationId, userId, messageSequence, role, status, content, model, errorCode, usageJson, null);
    }

    public MessageEntity(
            UUID id,
            UUID conversationId,
            UUID userId,
            long messageSequence,
            AiMessageRole role,
            AiMessageStatus status,
            String content,
            String model,
            String errorCode,
            String usageJson,
            String clientRequestId) {
        this.id = id;
        this.conversationId = conversationId;
        this.userId = userId;
        this.messageSequence = messageSequence;
        this.role = role;
        this.status = status;
        this.content = content;
        this.model = model;
        this.errorCode = errorCode;
        this.usageJson = usageJson;
        this.clientRequestId = clientRequestId;
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
    public UUID getConversationId() { return conversationId; }
    public UUID getUserId() { return userId; }
    public long getMessageSequence() { return messageSequence; }
    public AiMessageRole getRole() { return role; }
    public AiMessageStatus getStatus() { return status; }
    public String getContent() { return content; }
    public String getModel() { return model; }
    public String getErrorCode() { return errorCode; }
    public String getClientRequestId() { return clientRequestId; }
    public String getUsageJson() { return usageJson; }
    public Instant getCreatedAt() { return createdAt; }
}
