package com.auralis.app.review.internal.persistence;

import com.auralis.app.review.ReviewRating;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_events")
public class ReviewEventEntity {
    @Id
    private UUID id;
    private UUID userId;
    private UUID knowledgeBlockId;
    private UUID clientEventId;
    @Enumerated(EnumType.STRING)
    private ReviewRating rating;
    private Instant reviewedAt;
    private int durationSeconds;
    private long baseVersion;
    private String scheduler;
    private int schedulerVersion;
    private UUID parameterSetId;
    private String beforeState;
    private String afterState;
    private Instant createdAt;

    protected ReviewEventEntity() {
    }

    public ReviewEventEntity(UUID id, UUID userId, UUID knowledgeBlockId, UUID clientEventId,
                             ReviewRating rating, Instant reviewedAt, int durationSeconds, long baseVersion,
                             String scheduler, int schedulerVersion, UUID parameterSetId,
                             String beforeState, String afterState) {
        this.id = id;
        this.userId = userId;
        this.knowledgeBlockId = knowledgeBlockId;
        this.clientEventId = clientEventId;
        this.rating = rating;
        this.reviewedAt = reviewedAt;
        this.durationSeconds = durationSeconds;
        this.baseVersion = baseVersion;
        this.scheduler = scheduler;
        this.schedulerVersion = schedulerVersion;
        this.parameterSetId = parameterSetId;
        this.beforeState = beforeState;
        this.afterState = afterState;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getKnowledgeBlockId() { return knowledgeBlockId; }
    public UUID getClientEventId() { return clientEventId; }
    public ReviewRating getRating() { return rating; }
    public Instant getReviewedAt() { return reviewedAt; }
    public int getDurationSeconds() { return durationSeconds; }
    public long getBaseVersion() { return baseVersion; }
    public String getScheduler() { return scheduler; }
    public int getSchedulerVersion() { return schedulerVersion; }
    public UUID getParameterSetId() { return parameterSetId; }
    public String getBeforeState() { return beforeState; }
    public String getAfterState() { return afterState; }
    public Instant getCreatedAt() { return createdAt; }
}
