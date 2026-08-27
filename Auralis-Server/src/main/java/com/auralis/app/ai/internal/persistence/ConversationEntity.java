package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

import com.auralis.app.ai.ConversationPurpose;

@Entity
@Table(name = "conversations")
public class ConversationEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(length = 240)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ConversationPurpose purpose = ConversationPurpose.GENERAL;

    @Column(name = "source_id")
    private UUID sourceId;

    @Column(name = "client_request_id", length = 128)
    private String clientRequestId;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "next_message_sequence", nullable = false)
    private long nextMessageSequence;

    protected ConversationEntity() {
    }

    public ConversationEntity(UUID id, UUID userId, String title) {
        this(id, userId, title, null);
    }

    public ConversationEntity(UUID id, UUID userId, String title, String clientRequestId) {
        this(id, userId, title, clientRequestId, ConversationPurpose.GENERAL, null);
    }

    public ConversationEntity(
            UUID id,
            UUID userId,
            String title,
            String clientRequestId,
            ConversationPurpose purpose,
            UUID sourceId) {
        this.id = id;
        this.userId = userId;
        this.title = title;
        this.clientRequestId = clientRequestId;
        this.purpose = purpose == null ? ConversationPurpose.GENERAL : purpose;
        this.sourceId = sourceId;
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
    public String getTitle() { return title; }
    public ConversationPurpose getPurpose() { return purpose; }
    public UUID getSourceId() { return sourceId; }
    public String getClientRequestId() { return clientRequestId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }
    public long getVersion() { return version; }

    public long allocateNextMessageSequence() {
        nextMessageSequence++;
        return nextMessageSequence;
    }

    public void softDelete() {
        deletedAt = Instant.now();
    }
}
