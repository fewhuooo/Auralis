package com.auralis.app.review;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

public record ReviewStateView(
        UUID id,
        UUID userId,
        UUID knowledgeBlockId,
        UUID parameterSetId,
        double difficulty,
        double stability,
        Instant dueAt,
        Instant lastReviewedAt,
        int reps,
        int lapses,
        long version,
        Instant createdAt,
        Instant updatedAt,
        long knowledgeBlockVersion,
        boolean needsLearning,
        boolean mastered,
        int stableSuccessCount,
        String nextReviewStage,
        Instant lastPracticeAt,
        UUID lastReviewId,
        UUID pendingReviewId,
        @Schema(nullable = true, types = {"string", "null"}) String contentHash) {

    public ReviewStateView(UUID id, UUID userId, UUID knowledgeBlockId, UUID parameterSetId,
                           double difficulty, double stability, Instant dueAt, Instant lastReviewedAt,
                           int reps, int lapses, long version, Instant createdAt, Instant updatedAt) {
        this(id, userId, knowledgeBlockId, parameterSetId, difficulty, stability, dueAt, lastReviewedAt,
                reps, lapses, version, createdAt, updatedAt, 0, false, false, 0,
                null, null, null, null, null);
    }
}
