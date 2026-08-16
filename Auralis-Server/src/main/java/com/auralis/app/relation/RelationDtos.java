package com.auralis.app.relation;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RelationDtos {

    private RelationDtos() {
    }

    public record CreateRequest(
            @NotNull Long baseVersion,
            @NotNull RelationNodeType sourceType,
            @NotNull UUID sourceId,
            @NotNull RelationNodeType targetType,
            @NotNull UUID targetId,
            @NotNull RelationType type,
            @Size(max = 240) String label) {
        RelationCommand command() {
            return new RelationCommand(sourceType, sourceId, targetType, targetId, type, label);
        }
    }

    public record UpdateRequest(
            @NotNull Long baseVersion,
            @NotNull RelationNodeType sourceType,
            @NotNull UUID sourceId,
            @NotNull RelationNodeType targetType,
            @NotNull UUID targetId,
            @NotNull RelationType type,
            @Size(max = 240) String label) {
        RelationCommand command() {
            return new RelationCommand(sourceType, sourceId, targetType, targetId, type, label);
        }
    }

    public record VersionRequest(@NotNull Long baseVersion) {
    }

    public record ListResponse(List<Response> items, String nextCursor, boolean hasMore) {
        public ListResponse {
            items = List.copyOf(items);
        }
    }

    public record Response(
            UUID id,
            RelationNodeType sourceType,
            UUID sourceId,
            RelationNodeType targetType,
            UUID targetId,
            RelationType type,
            String label,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        static Response from(RelationView view) {
            return new Response(view.id(), view.sourceType(), view.sourceId(), view.targetType(), view.targetId(),
                    view.type(), view.label(), view.version(), view.createdAt(), view.updatedAt(), view.deletedAt());
        }
    }
}
