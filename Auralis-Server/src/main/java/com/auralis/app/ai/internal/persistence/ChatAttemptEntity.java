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
@Table(name = "chat_attempts")
public class ChatAttemptEntity {
    @Id private UUID id;
    @Column(name = "run_id", nullable = false) private UUID runId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "request_id", nullable = false, length = 128) private String requestId;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(name = "attempt_no", nullable = false) private int attemptNo;
    @Column(nullable = false, length = 24) private String status;
    @Column(name = "worker_instance_id", nullable = false, length = 128) private String workerInstanceId;
    @Column(name = "fence_version", nullable = false) private long fenceVersion;
    @Column(name = "allocated_reply_message_id", nullable = false) private UUID allocatedReplyMessageId;
    @Column(name = "reply_message_id") private UUID replyMessageId;
    @Column(name = "public_parts_json", nullable = false, columnDefinition = "TEXT") private String publicPartsJson;
    @Column(name = "tool_trace_json", nullable = false, columnDefinition = "TEXT") private String toolTraceJson;
    @Column(name = "private_tool_evidence_json", nullable = false, columnDefinition = "TEXT") private String privateToolEvidenceJson = "[]";
    @Column(name = "last_sequence", nullable = false) private long lastSequence;
    @Column(name = "cancel_requested_at") private Instant cancelRequestedAt;
    @Column(name = "safe_error_code", length = 64) private String safeErrorCode;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "heartbeat_at") private Instant heartbeatAt;
    @Column(name = "deadline_at", nullable = false) private Instant deadlineAt;
    @Column(name = "ended_at") private Instant endedAt;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected ChatAttemptEntity() {}

    public ChatAttemptEntity(UUID id, UUID runId, UUID userId, String requestId, String requestHash,
                             int attemptNo, String workerInstanceId, long fenceVersion,
                             UUID allocatedReplyMessageId, String publicPartsJson, String toolTraceJson,
                             Instant deadlineAt) {
        this.id = id;
        this.runId = runId;
        this.userId = userId;
        this.requestId = requestId;
        this.requestHash = requestHash;
        this.attemptNo = attemptNo;
        this.status = "PENDING";
        this.workerInstanceId = workerInstanceId;
        this.fenceVersion = fenceVersion;
        this.allocatedReplyMessageId = allocatedReplyMessageId;
        this.publicPartsJson = publicPartsJson;
        this.toolTraceJson = toolTraceJson;
        this.privateToolEvidenceJson = "[]";
        this.deadlineAt = deadlineAt;
    }

    @PrePersist void onCreate() { Instant now = Instant.now(); createdAt = now; updatedAt = now; }
    @PreUpdate void onUpdate() { updatedAt = Instant.now(); }
    public void markRunning() { status = "RUNNING"; if (startedAt == null) startedAt = Instant.now(); heartbeatAt = Instant.now(); }
    public void requestCancel() { status = "CANCEL_REQUESTED"; cancelRequestedAt = Instant.now(); }
    public void markUnknown() { status = "UNKNOWN"; safeErrorCode = "CHAT_WORKER_OWNERSHIP_UNKNOWN"; }
    public void updateSnapshot(String partsJson, String traceJson, long sequence) {
        publicPartsJson = partsJson; toolTraceJson = traceJson; lastSequence = sequence; heartbeatAt = Instant.now();
    }
    public void updatePrivateToolEvidence(String evidenceJson) {
        privateToolEvidenceJson = java.util.Objects.requireNonNull(evidenceJson, "evidenceJson");
        heartbeatAt = Instant.now();
    }
    public void completeMessage(UUID messageId, String terminalStatus, String errorCode) {
        if (!allocatedReplyMessageId.equals(messageId)) throw new IllegalArgumentException("Reply message ID mismatch");
        replyMessageId = messageId; status = terminalStatus; safeErrorCode = errorCode; endedAt = Instant.now(); heartbeatAt = endedAt;
    }
    public void attachCompletedBusinessMessage(UUID messageId) {
        if (!allocatedReplyMessageId.equals(messageId)) throw new IllegalArgumentException("Reply message ID mismatch");
        replyMessageId = messageId;
    }
    public UUID getId() { return id; }
    public UUID getRunId() { return runId; }
    public UUID getUserId() { return userId; }
    public String getRequestId() { return requestId; }
    public String getRequestHash() { return requestHash; }
    public int getAttemptNo() { return attemptNo; }
    public String getStatus() { return status; }
    public String getWorkerInstanceId() { return workerInstanceId; }
    public long getFenceVersion() { return fenceVersion; }
    public UUID getAllocatedReplyMessageId() { return allocatedReplyMessageId; }
    public UUID getReplyMessageId() { return replyMessageId; }
    public String getPublicPartsJson() { return publicPartsJson; }
    public String getToolTraceJson() { return toolTraceJson; }
    public String getPrivateToolEvidenceJson() { return privateToolEvidenceJson; }
    public long getLastSequence() { return lastSequence; }
    public Instant getCancelRequestedAt() { return cancelRequestedAt; }
    public String getSafeErrorCode() { return safeErrorCode; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getHeartbeatAt() { return heartbeatAt; }
    public Instant getDeadlineAt() { return deadlineAt; }
    public Instant getEndedAt() { return endedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
