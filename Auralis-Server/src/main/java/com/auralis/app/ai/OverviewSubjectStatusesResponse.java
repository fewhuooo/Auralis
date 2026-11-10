package com.auralis.app.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Schema(description = "Current Overview metadata for requested active owned subjects")
public record OverviewSubjectStatusesResponse(
        @NotNull List<@NotNull Item> items) {

    public enum Status {
        AVAILABLE,
        MISSING,
        UNAVAILABLE
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Item(
            @NotNull UUID subjectId,
            @NotNull Status status,
            @Schema(nullable = true, types = {"integer", "null"}) Long version,
            @Schema(nullable = true, types = {"integer", "null"}) Long outlineVersion,
            @Schema(nullable = true, types = {"integer", "null"}) Long summaryVersion,
            @Schema(nullable = true, types = {"string", "null"}) Instant updatedAt) {
    }
}
