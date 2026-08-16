package com.auralis.app.review;

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
        Instant updatedAt) {
}
