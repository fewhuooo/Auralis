package com.auralis.app.knowledge;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class KnowledgeBlockDtos {

    private KnowledgeBlockDtos() {
    }

    public record CreateRequest(
            @NotNull Long baseVersion,
            @NotNull UUID subjectId,
            UUID sourceId,
            @NotBlank @Size(max = 240) String title,
            @Size(max = 4000) String summary,
            @NotBlank String content,
            @Size(max = 32) List<@NotBlank @Size(max = 120) String> tags,
            @Size(max = 32) String colorOverride) {
        KnowledgeBlockCommand command() {
            return new KnowledgeBlockCommand(subjectId, sourceId, title, summary, content, tags, colorOverride);
        }
    }

    public record UpdateRequest(
            @NotNull Long baseVersion,
            @NotNull UUID subjectId,
            UUID sourceId,
            @NotBlank @Size(max = 240) String title,
            @Size(max = 4000) String summary,
            @NotBlank String content,
            @Size(max = 32) List<@NotBlank @Size(max = 120) String> tags,
            @Size(max = 32) String colorOverride) {
        KnowledgeBlockCommand command() {
            return new KnowledgeBlockCommand(subjectId, sourceId, title, summary, content, tags, colorOverride);
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
            UUID subjectId,
            UUID sourceId,
            String title,
            String summary,
            String content,
            List<String> tags,
            String colorOverride,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        static Response from(KnowledgeBlockView view) {
            return new Response(view.id(), view.subjectId(), view.sourceId(), view.title(), view.summary(), view.content(),
                    view.tags(), view.colorOverride(), view.version(), view.createdAt(), view.updatedAt(), view.deletedAt());
        }
    }
}
