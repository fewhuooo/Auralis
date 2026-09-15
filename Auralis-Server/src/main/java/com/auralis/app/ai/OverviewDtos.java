package com.auralis.app.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.UUID;

public final class OverviewDtos {

    private OverviewDtos() {
    }

    public record SourceOverviewRequest(
            @NotNull UUID sourceId,
            @NotNull OverviewMode mode,
            @Size(max = 2000) String instruction) {
    }

    public record SubjectOverviewRequest(
            @NotNull UUID subjectId,
            @NotNull OverviewMode mode,
            @Size(max = 2000) String instruction,
            @NotNull @Size(min = 1, max = 100) List<@Valid SubjectOverviewSourceInput> sources) {
        public SubjectOverviewRequest {
            sources = sources == null ? null : List.copyOf(sources);
        }
    }

    public record SubjectOverviewSourceInput(
            @NotNull UUID sourceId,
            @Size(max = 300) String title,
            @Schema(nullable = true, types = {"array", "null"}) @Size(max = 60) List<@Valid OverviewChapter> outline,
            @Schema(nullable = true, types = {"object", "null"}) @Valid OverviewSummary summary) {
    }

    public record OverviewResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int schemaVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Size(max = 300) String title,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"array", "null"})
            @Size(max = 60) List<@Valid OverviewChapter> outline,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
            OverviewSummary summary) {
    }

    public record OverviewChapter(
            @Size(max = 300) String title,
            @NotNull @Size(max = 500) List<@Valid OverviewSection> sections) {
    }

    public record OverviewSection(
            @Size(max = 300) String title,
            @Size(max = 4000) String summary,
            @NotNull @Size(min = 1, max = 100) List<@Size(max = 300) String> sourceIds,
            @Schema(nullable = true) @Valid OverviewLocator locator) {
    }

    public record OverviewLocator(@Positive Integer page, @Size(max = 300) String blockId) {
    }

    public record OverviewSummary(
            @Size(max = 4000) String overview,
            @NotNull @Size(max = 100) List<@Size(max = 4000) String> keyPoints,
            @NotNull @Size(max = 100) List<@Size(max = 4000) String> learningPath) {
    }
}
