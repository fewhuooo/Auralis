package com.auralis.app.review.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_lifecycle_commands")
public class ReviewLifecycleCommandEntity {
    @Id
    private UUID id;
    private UUID userId;
    private UUID knowledgeBlockId;
    private UUID clientCommandId;
    private String action;
    private Instant occurredAt;
    private long knowledgeBlockVersion;
    private long baseVersion;
    private UUID reviewId;
    private String rating;
    private Integer durationSeconds;
    private String contentHash;
    @Column(columnDefinition = "TEXT")
    private String requestPayload;
    @Column(columnDefinition = "TEXT")
    private String responsePayload;
    private Instant createdAt;

    protected ReviewLifecycleCommandEntity() { }

    public ReviewLifecycleCommandEntity(UUID id, UUID userId, UUID knowledgeBlockId, UUID clientCommandId,
                                        String action, Instant occurredAt, long knowledgeBlockVersion,
                                        long baseVersion, UUID reviewId, String rating, Integer durationSeconds,
                                        String contentHash, String requestPayload, String responsePayload) {
        this.id = id;
        this.userId = userId;
        this.knowledgeBlockId = knowledgeBlockId;
        this.clientCommandId = clientCommandId;
        this.action = action;
        this.occurredAt = occurredAt;
        this.knowledgeBlockVersion = knowledgeBlockVersion;
        this.baseVersion = baseVersion;
        this.reviewId = reviewId;
        this.rating = rating;
        this.durationSeconds = durationSeconds;
        this.contentHash = contentHash;
        this.requestPayload = requestPayload;
        this.responsePayload = responsePayload;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getKnowledgeBlockId() { return knowledgeBlockId; }
    public UUID getClientCommandId() { return clientCommandId; }
    public String getAction() { return action; }
    public Instant getOccurredAt() { return occurredAt; }
    public long getKnowledgeBlockVersion() { return knowledgeBlockVersion; }
    public long getBaseVersion() { return baseVersion; }
    public UUID getReviewId() { return reviewId; }
    public String getRating() { return rating; }
    public Integer getDurationSeconds() { return durationSeconds; }
    public String getContentHash() { return contentHash; }
    public String getRequestPayload() { return requestPayload; }
    public String getResponsePayload() { return responsePayload; }
    public Instant getCreatedAt() { return createdAt; }
}
