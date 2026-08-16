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
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
