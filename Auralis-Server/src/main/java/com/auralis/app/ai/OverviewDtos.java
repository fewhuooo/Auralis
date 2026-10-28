package com.auralis.app.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.UUID;

public final class OverviewDtos {

    private OverviewDtos() {
    }

    public record SourceOverviewRequest(
            @NotNull UUID sourceId,
            @NotNull OverviewMode mode,
            @Size(max = 2000) String instruction,
            @Schema(description = "Previous X-Overview-Request-Id to explicitly replace with a new attempt")
            UUID retryOfRequestId) {
        public SourceOverviewRequest(UUID sourceId, OverviewMode mode, String instruction) {
            this(sourceId, mode, instruction, null);
        }
    }

    public record SubjectOverviewRequest(
            @NotNull UUID subjectId,
            @NotNull OverviewMode mode,
            @Size(max = 2000) String instruction,
            @NotNull @NotEmpty List<@Valid SubjectOverviewSourceInput> sources,
            @Schema(description = "Previous X-Overview-Request-Id to explicitly replace with a new attempt")
            UUID retryOfRequestId) {
        public SubjectOverviewRequest(UUID subjectId, OverviewMode mode, String instruction,
                                      List<SubjectOverviewSourceInput> sources) {
            this(subjectId, mode, instruction, sources, null);
        }

        public SubjectOverviewRequest {
            sources = sources == null ? null : List.copyOf(sources);
        }
    }

    public record SubjectOverviewSourceInput(
            @NotNull UUID sourceId,
            @Size(max = 300) String title,
            @Schema(nullable = true, types = {"array", "null"}) List<@Valid OverviewChapter> outline,
            @Schema(nullable = true, types = {"object", "null"}) @Valid OverviewSummary summary) {
    }

    public record OverviewResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int schemaVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"array", "null"})
            List<@Valid OverviewChapter> outline,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
            OverviewSummary summary,
            @JsonInclude(JsonInclude.Include.NON_NULL) OverviewIdentityDtos.OutlineProvenanceInput outlineProvenance) {
        public OverviewResponse(int schemaVersion, String title, List<OverviewChapter> outline,
                                OverviewSummary summary) {
            this(schemaVersion, title, outline, summary, null);
        }
    }

    public record OverviewChapter(
            String title,
            @NotNull List<@Valid OverviewSection> sections) {
    }

    public record OverviewSection(
            String title,
            String summary,
            @NotNull @NotEmpty List<@Size(max = 300) String> sourceIds,
            @Schema(nullable = true) @Valid OverviewLocator locator) {
    }

    public record OverviewLocator(@Positive Integer page, @Size(max = 300) String blockId) {
    }

    public record OverviewSummary(
            String overview,
            @NotNull List<String> keyPoints,
            @NotNull List<String> learningPath) {
    }
}
