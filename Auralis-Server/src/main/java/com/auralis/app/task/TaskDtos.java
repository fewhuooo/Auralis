package com.auralis.app.task;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TaskDtos {

    private TaskDtos() {
    }

    public record CreateRequest(
            @NotNull Long baseVersion,
            @NotNull UUID subjectId,
            @NotBlank @Size(max = 240) String title,
            @Size(max = 4000) String description,
            TaskStatus status,
            Instant scheduledAt,
            Instant dueAt,
            @PositiveOrZero Integer durationMinutes,
            CognitiveLoad cognitiveLoad,
            @Size(max = 128) String sortKey,
            @Size(max = 32) String colorOverride) {
        TaskCommand command() {
            return new TaskCommand(subjectId, title, description, status, scheduledAt, dueAt, durationMinutes,
                    cognitiveLoad, sortKey, colorOverride);
        }
    }

    public record UpdateRequest(
            @NotNull Long baseVersion,
            @NotNull UUID subjectId,
            @NotBlank @Size(max = 240) String title,
            @Size(max = 4000) String description,
            TaskStatus status,
            Instant scheduledAt,
            Instant dueAt,
            @PositiveOrZero Integer durationMinutes,
            CognitiveLoad cognitiveLoad,
            @Size(max = 128) String sortKey,
            @Size(max = 32) String colorOverride) {
        TaskCommand command() {
            return new TaskCommand(subjectId, title, description, status, scheduledAt, dueAt, durationMinutes,
                    cognitiveLoad, sortKey, colorOverride);
        }
    }

    public record VersionRequest(@NotNull Long baseVersion) {
    }

    public record ScheduleSwapRequest(
            @NotNull UUID sourceTaskId,
            @NotNull Long sourceBaseVersion,
            @NotNull UUID targetTaskId,
            @NotNull Long targetBaseVersion) {
    }

    public record ScheduleSwapResponse(Response source, Response target) {
    }

    public record ListResponse(List<Response> items, String nextCursor, boolean hasMore) {
        public ListResponse {
            items = List.copyOf(items);
        }
    }

    public record Response(
            UUID id,
            UUID subjectId,
            String title,
            String description,
            TaskStatus status,
            Instant scheduledAt,
            Instant dueAt,
            Integer durationMinutes,
            CognitiveLoad cognitiveLoad,
            String sortKey,
            String colorOverride,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        static Response from(TaskView view) {
            return new Response(view.id(), view.subjectId(), view.title(), view.description(), view.status(),
                    view.scheduledAt(), view.dueAt(), view.durationMinutes(), view.cognitiveLoad(), view.sortKey(),
                    view.colorOverride(), view.version(), view.createdAt(), view.updatedAt(), view.deletedAt());
        }
    }
}
