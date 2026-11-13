package com.auralis.app.review.internal.persistence;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_states")
public class ReviewStateEntity {
    @Id
    private UUID id;
    private UUID userId;
    private UUID knowledgeBlockId;
    private UUID parameterSetId;
    private double difficulty;
    private double stability;
    private Instant dueAt;
    private Instant lastReviewedAt;
    private int reps;
    private int lapses;
    private boolean needsLearning;
    private boolean mastered;
    private int stableSuccessCount;
    private String nextReviewStage;
    private Instant lastPracticeAt;
    private UUID lastReviewId;
    private UUID pendingReviewId;
    private String contentHash;
    @Version
    private long version;
    private Instant createdAt;
    private Instant updatedAt;

    protected ReviewStateEntity() {
    }

    public ReviewStateEntity(UUID id, UUID userId, UUID knowledgeBlockId, UUID parameterSetId,
                             double difficulty, double stability, Instant dueAt) {
        this.id = id;
        this.userId = userId;
        this.knowledgeBlockId = knowledgeBlockId;
        this.parameterSetId = parameterSetId;
        this.difficulty = difficulty;
        this.stability = stability;
        this.dueAt = dueAt;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public void apply(double difficulty, double stability, Instant dueAt, Instant reviewedAt, int reps, int lapses) {
        this.difficulty = difficulty;
        this.stability = stability;
        this.dueAt = dueAt;
        this.lastReviewedAt = reviewedAt;
        this.reps = reps;
        this.lapses = lapses;
        this.updatedAt = Instant.now();
    }

    public void applyLifecycle(double stability, Instant dueAt, Instant practiceAt,
                               boolean needsLearning, boolean mastered, int stableSuccessCount,
                               String nextReviewStage, UUID lastReviewId, UUID pendingReviewId,
                               String contentHash) {
        this.stability = stability;
        this.dueAt = dueAt;
        this.lastPracticeAt = practiceAt;
        this.needsLearning = needsLearning;
        this.mastered = mastered;
        this.stableSuccessCount = stableSuccessCount;
        this.nextReviewStage = nextReviewStage;
        this.lastReviewId = lastReviewId;
        this.pendingReviewId = pendingReviewId;
        this.contentHash = contentHash;
        this.updatedAt = Instant.now();
    }

    public void invalidateForContent(String newContentHash) {
        this.needsLearning = true;
        this.mastered = false;
        this.stableSuccessCount = 0;
        this.nextReviewStage = "EARLY_RECALL";
        this.contentHash = newContentHash;
        clearCausalReview();
    }

    public void clearCausalReview() {
        this.lastReviewId = null;
        this.pendingReviewId = null;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getKnowledgeBlockId() { return knowledgeBlockId; }
    public UUID getParameterSetId() { return parameterSetId; }
    public double getDifficulty() { return difficulty; }
    public double getStability() { return stability; }
    public Instant getDueAt() { return dueAt; }
    public Instant getLastReviewedAt() { return lastReviewedAt; }
    public int getReps() { return reps; }
    public int getLapses() { return lapses; }
    public boolean isNeedsLearning() { return needsLearning; }
    public boolean isMastered() { return mastered; }
    public int getStableSuccessCount() { return stableSuccessCount; }
    public String getNextReviewStage() { return nextReviewStage; }
    public Instant getLastPracticeAt() { return lastPracticeAt; }
    public UUID getLastReviewId() { return lastReviewId; }
    public UUID getPendingReviewId() { return pendingReviewId; }
    public String getContentHash() { return contentHash; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
