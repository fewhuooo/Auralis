package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_runs")
public class ChatRunEntity {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "conversation_id", nullable = false) private UUID conversationId;
    @Column(name = "request_id", nullable = false, length = 128) private String requestId;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(name = "request_context_json", nullable = false, columnDefinition = "TEXT") private String requestContextJson;
    @Column(nullable = false, length = 24) private String action;
    @Column(name = "user_message_id", nullable = false) private UUID userMessageId;
    @Column(name = "current_attempt_id") private UUID currentAttemptId;
    @Column(name = "current_reply_message_id") private UUID currentReplyMessageId;
    @Column(name = "budget_task_id", nullable = false) private UUID budgetTaskId;
    @Column(nullable = false, length = 16) private String status;
    @Column(name = "fence_version", nullable = false) private long fenceVersion;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "completed_at") private Instant completedAt;

    protected ChatRunEntity() {}

    public ChatRunEntity(UUID id, UUID userId, UUID conversationId, String requestId, String requestHash,
                         String requestContextJson, String action, UUID userMessageId, UUID budgetTaskId, long fenceVersion) {
        this.id = id;
        this.userId = userId;
        this.conversationId = conversationId;
        this.requestId = requestId;
        this.requestHash = requestHash;
        this.requestContextJson = requestContextJson;
        this.action = action;
        this.userMessageId = userMessageId;
        this.budgetTaskId = budgetTaskId;
        this.fenceVersion = fenceVersion;
        this.status = "PENDING";
    }

    @PrePersist void onCreate() { Instant now = Instant.now(); createdAt = now; updatedAt = now; }
    @PreUpdate void onUpdate() { updatedAt = Instant.now(); }
    public void pointToAttempt(UUID attemptId, UUID replyId) { currentAttemptId = attemptId; currentReplyMessageId = replyId; }
    public void advanceFence(long nextFence) { fenceVersion = nextFence; }
    public void mark(String nextStatus) {
        status = nextStatus;
        if (isTerminal(nextStatus)) completedAt = Instant.now();
        else completedAt = null;
    }
    public void markUnknown() { status = "UNKNOWN"; completedAt = null; }
    private boolean isTerminal(String value) { return "COMPLETED".equals(value) || "FAILED".equals(value) || "CANCELLED".equals(value) || "UNKNOWN".equals(value); }
    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getConversationId() { return conversationId; }
    public String getRequestId() { return requestId; }
    public String getRequestHash() { return requestHash; }
    public String getRequestContextJson() { return requestContextJson; }
    public String getAction() { return action; }
    public UUID getUserMessageId() { return userMessageId; }
    public UUID getCurrentAttemptId() { return currentAttemptId; }
    public UUID getCurrentReplyMessageId() { return currentReplyMessageId; }
    public UUID getBudgetTaskId() { return budgetTaskId; }
    public String getStatus() { return status; }
    public long getFenceVersion() { return fenceVersion; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
}
