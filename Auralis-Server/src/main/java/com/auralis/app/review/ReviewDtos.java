package com.auralis.app.review;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public final class ReviewDtos {
    private ReviewDtos() { }

    public record EventRequest(@NotNull UUID clientEventId, @NotNull UUID knowledgeBlockId,
                               @NotNull ReviewRating rating, @NotNull Instant reviewedAt,
                               @Min(0) int durationSeconds, @Min(0) long baseVersion) {
    }

    public record EventResponse(ReviewEventView event, ReviewStateView state) {
    }
}
