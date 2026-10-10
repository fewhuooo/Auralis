package com.auralis.app.review.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_lifecycle_reviews")
public class ReviewLifecycleReviewEntity {
    @Id
    private UUID reviewId;
    private UUID userId;
    private UUID knowledgeBlockId;
    private String selectedRating;
    private String effectiveRating;
    private Instant selectedAt;
    private Instant resolvedAt;
    private String resolution;
    private int durationSeconds;
    private long knowledgeBlockVersion;
    private String contentHash;
    @Column(columnDefinition = "TEXT")
    private String beforeState;
    private Instant createdAt;

    protected ReviewLifecycleReviewEntity() { }

    public ReviewLifecycleReviewEntity(UUID reviewId, UUID userId, UUID knowledgeBlockId,
                                       String selectedRating, String effectiveRating, Instant selectedAt,
                                       Instant resolvedAt, String resolution, int durationSeconds,
                                       long knowledgeBlockVersion, String contentHash, String beforeState) {
        this.reviewId = reviewId;
        this.userId = userId;
        this.knowledgeBlockId = knowledgeBlockId;
        this.selectedRating = selectedRating;
        this.effectiveRating = effectiveRating;
        this.selectedAt = selectedAt;
        this.resolvedAt = resolvedAt;
        this.resolution = resolution;
        this.durationSeconds = durationSeconds;
        this.knowledgeBlockVersion = knowledgeBlockVersion;
        this.contentHash = contentHash;
        this.beforeState = beforeState;
        this.createdAt = Instant.now();
    }

    public void confirm(String rating, Instant at) {
        this.effectiveRating = rating;
        this.resolvedAt = at;
        this.resolution = "CONFIRMED";
    }

    public void correctAgain(Instant at) {
        this.effectiveRating = "AGAIN";
        this.resolvedAt = at;
        this.resolution = "CORRECTED_AGAIN";
    }

    public void supersede() {
        if (this.effectiveRating == null) {
            this.resolution = "SUPERSEDED";
        }
    }

    public UUID getReviewId() { return reviewId; }
    public UUID getUserId() { return userId; }
    public UUID getKnowledgeBlockId() { return knowledgeBlockId; }
    public String getSelectedRating() { return selectedRating; }
    public String getEffectiveRating() { return effectiveRating; }
    public Instant getSelectedAt() { return selectedAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public String getResolution() { return resolution; }
    public int getDurationSeconds() { return durationSeconds; }
    public long getKnowledgeBlockVersion() { return knowledgeBlockVersion; }
    public String getContentHash() { return contentHash; }
    public String getBeforeState() { return beforeState; }
    public Instant getCreatedAt() { return createdAt; }
}
