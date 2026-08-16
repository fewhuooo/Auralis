package com.auralis.app.review;

import java.time.Instant;
import java.util.UUID;

public record ReviewEventView(
        UUID id,
        UUID userId,
        UUID knowledgeBlockId,
        UUID clientEventId,
        ReviewRating rating,
        Instant reviewedAt,
        int durationSeconds,
        long baseVersion,
        String scheduler,
        int schedulerVersion,
        UUID parameterSetId,
        Instant createdAt) {
}
