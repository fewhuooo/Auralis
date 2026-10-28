package com.auralis.app.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public final class OverviewJobDtos {
    private OverviewJobDtos() { }

    public enum Scope { SOURCE, SUBJECT }
    public enum Mode { ALL, OUTLINE }

    public enum Status {
        QUEUED, RUNNING, PAUSING, PAUSED, CANCELLING, CANCELLED, COMPLETED,
        FAILED, RECOVERY_REQUIRED, EXPIRED
    }

    public enum Stage { QUEUED, VALIDATING, INDEXING, PLANNING, WRITING, ASSEMBLING, COMPLETE }

    public record StartRequest(
            @NotNull UUID clientRequestId,
            @NotNull Scope scope,
            UUID sourceId,
            UUID subjectId,
            List<@NotNull UUID> sourceIds,
            @NotNull Mode mode,
            @Size(max = 2000) String instruction) {
        public StartRequest {
            sourceIds = sourceIds == null ? null : Collections.unmodifiableList(new ArrayList<>(sourceIds));
        }
    }

    public record ControlRequest(@Min(1) @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int expectedVersion) { }

    public record JobView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID jobId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Status status,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Scope scope,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"string", "null"}) UUID sourceId,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"string", "null"}) UUID subjectId,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"array", "null"}) List<UUID> sourceIds,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Mode mode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Stage stage,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int verifiedNodes,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"integer", "null"}) Integer totalNodes,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"string", "null"}) Instant deadlineAt,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"string", "null"}) String safeErrorCode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"string", "null"}) Instant completedAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long publicationBaseVersion) {
        public JobView(UUID jobId, Status status, int version, Scope scope, UUID sourceId, UUID subjectId,
                       List<UUID> sourceIds, Mode mode, Stage stage, int verifiedNodes, Integer totalNodes,
                       Instant deadlineAt, String safeErrorCode, Instant createdAt, Instant updatedAt,
                       Instant completedAt) {
            this(jobId, status, version, scope, sourceId, subjectId, sourceIds, mode, stage, verifiedNodes,
                    totalNodes, deadlineAt, safeErrorCode, createdAt, updatedAt, completedAt, 0);
        }
    }

    public record JobList(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<JobView> jobs,
            @JsonInclude(JsonInclude.Include.ALWAYS)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"string", "null"}) String nextCursor) { }

    public record Candidate(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID jobId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OverviewDtos.OverviewResponse result) { }

    public record PageRequest(@Min(1) @Max(50) int limit, String cursor) { }
}
