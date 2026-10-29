package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_activities")
public class ChatActivityEntity {
    @Id private UUID id;
    @Column(name = "run_id", nullable = false) private UUID runId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "attempt_id", nullable = false) private UUID attemptId;
    @Column(name = "message_id", nullable = false) private UUID messageId;
    @Column(name = "block_id", nullable = false) private UUID blockId;
    @Column(name = "question_version", nullable = false) private int questionVersion;
    @Column(name = "question_type", nullable = false, length = 16) private String questionType;
    @Column(nullable = false, length = 16) private String state;
    @Column(name = "public_payload_json", nullable = false, columnDefinition = "TEXT") private String publicPayloadJson;
    @Column(name = "private_reference_json", columnDefinition = "TEXT") private String privateReferenceJson;
    @Column(name = "submission_id") private UUID submissionId;
    @Column(name = "answer_hash", length = 64) private String answerHash;
    @Column(name = "answer_json", columnDefinition = "TEXT") private String answerJson;
    @Column(name = "submission_user_message_id") private UUID submissionUserMessageId;
    @Column(name = "reply_run_id") private UUID replyRunId;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "submitted_at") private Instant submittedAt;

    protected ChatActivityEntity() {}
    public ChatActivityEntity(UUID id, UUID runId, UUID userId, UUID attemptId, UUID messageId, UUID blockId,
                              int questionVersion, String questionType, String state,
                              String publicPayloadJson, String privateReferenceJson) {
        this.id = id; this.runId = runId; this.userId = userId; this.attemptId = attemptId; this.messageId = messageId;
        this.blockId = blockId; this.questionVersion = questionVersion; this.questionType = questionType;
        this.state = state; this.publicPayloadJson = publicPayloadJson; this.privateReferenceJson = privateReferenceJson;
    }
    @PrePersist void onCreate() { createdAt = Instant.now(); }
    public void markSubmitted(UUID id, String hash, String json, UUID userMessageId, UUID nextRunId,
                              String nextPublicPayloadJson) {
        submissionId = id; answerHash = hash; answerJson = json; submissionUserMessageId = userMessageId;
        replyRunId = nextRunId; submittedAt = Instant.now(); state = "SUBMITTED";
        publicPayloadJson = nextPublicPayloadJson;
    }
    public UUID getId() { return id; }
    public UUID getRunId() { return runId; }
    public UUID getUserId() { return userId; }
    public UUID getAttemptId() { return attemptId; }
    public UUID getMessageId() { return messageId; }
    public UUID getBlockId() { return blockId; }
    public int getQuestionVersion() { return questionVersion; }
    public String getQuestionType() { return questionType; }
    public String getState() { return state; }
    public String getPublicPayloadJson() { return publicPayloadJson; }
    public String getPrivateReferenceJson() { return privateReferenceJson; }
    public UUID getSubmissionId() { return submissionId; }
    public String getAnswerHash() { return answerHash; }
    public String getAnswerJson() { return answerJson; }
    public UUID getSubmissionUserMessageId() { return submissionUserMessageId; }
    public UUID getReplyRunId() { return replyRunId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getSubmittedAt() { return submittedAt; }
}
