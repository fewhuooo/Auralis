package com.auralis.app.review;

import java.time.Instant;
import java.util.UUID;

public record ReviewEventCommand(
        UUID clientEventId,
        UUID knowledgeBlockId,
        ReviewRating rating,
        Instant reviewedAt,
        int durationSeconds,
        long baseVersion) {
}
