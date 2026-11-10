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
import com.auralis.app.ai.ChatConversationScopeState;

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

    @Column(name = "chat_protocol_version")
    private Short chatProtocolVersion;

    @Column(name = "active_chat_run_id")
    private UUID activeChatRunId;

    @Column(name = "chat_fence", nullable = false)
    private long chatFence;

    @Enumerated(EnumType.STRING)
    @Column(name = "chat_scope_state", nullable = false, length = 16)
    private ChatConversationScopeState chatScopeState = ChatConversationScopeState.LEGACY;

    @Column(name = "chat_scope_json", columnDefinition = "text")
    private String chatScopeJson;

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

    public void enableChatProtocolOne() {
        this.chatProtocolVersion = (short) 1;
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
    public Short getChatProtocolVersion() { return chatProtocolVersion; }
    public UUID getActiveChatRunId() { return activeChatRunId; }
    public long getChatFence() { return chatFence; }
    public ChatConversationScopeState getChatScopeState() { return chatScopeState; }
    public String getChatScopeJson() { return chatScopeJson; }

    public void markChatScopeUnbound() {
        if (chatScopeState != ChatConversationScopeState.LEGACY) {
            throw new IllegalStateException("Only new Chat conversations can start unbound");
        }
        chatScopeState = ChatConversationScopeState.UNBOUND;
    }

    public void bindChatScope(String scopeJson) {
        if (chatScopeState != ChatConversationScopeState.UNBOUND) {
            throw new IllegalStateException("Only an unbound Chat conversation can be bound");
        }
        chatScopeJson = scopeJson;
        chatScopeState = ChatConversationScopeState.BOUND;
    }

    public long reserveChatRun(UUID runId) {
        if (activeChatRunId != null) {
            throw new IllegalStateException("Conversation already has an active Chat run");
        }
        activeChatRunId = java.util.Objects.requireNonNull(runId, "runId");
        chatFence++;
        return chatFence;
    }

    public long advancePendingChatRunFence(UUID runId) {
        if (!java.util.Objects.equals(activeChatRunId, runId)) {
            throw new IllegalStateException("Pending Chat run no longer owns the conversation slot");
        }
        chatFence++;
        return chatFence;
    }

    public long fenceUnknownChatRun(UUID runId) {
        if (!java.util.Objects.equals(activeChatRunId, runId)) {
            throw new IllegalStateException("Unknown Chat run no longer owns the conversation slot");
        }
        chatFence++;
        return chatFence;
    }

    public void releaseChatRun(UUID runId, long ownerFence) {
        if (!java.util.Objects.equals(activeChatRunId, runId) || chatFence != ownerFence) {
            throw new IllegalStateException("Chat run no longer owns the conversation fence");
        }
        activeChatRunId = null;
        chatFence++;
    }

    public long allocateNextMessageSequence() {
        nextMessageSequence++;
        return nextMessageSequence;
    }

    public void softDelete() {
        deletedAt = Instant.now();
    }
}
