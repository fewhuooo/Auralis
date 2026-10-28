package com.auralis.app.ai;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.Instant;
import java.util.UUID;

public final class OverviewPublicationDtos {
    private OverviewPublicationDtos() { }

    public record PublishRequest(@NotNull UUID clientPublishId,
                                 @Positive @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int expectedVersion,
                                 @Min(0) @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long baseVersion) { }

    public enum State { PENDING, PUBLISHED, CONFLICT, FAILED }

    public record PublicationView(UUID publicationId, UUID jobId, State state, int version,
                                  UUID resultId, Long resultVersion, String safeErrorCode,
                                  Instant retryAt, Instant updatedAt) { }
}
