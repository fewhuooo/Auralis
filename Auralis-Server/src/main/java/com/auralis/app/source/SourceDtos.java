package com.auralis.app.source;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SourceDtos {

    private SourceDtos() {
    }

    public record CreateRequest(
            @NotNull Long baseVersion,
            @NotNull UUID subjectId,
            @NotNull SourceType type,
            @NotBlank @Size(max = 240) String title,
            UUID assetId,
            @Size(max = 2048) String originUrl,
            String rawText,
            String outline) {
        SourceCommand command() {
            return new SourceCommand(subjectId, type, title, assetId, originUrl, rawText, outline);
        }
    }

    public record UpdateRequest(
            @NotNull Long baseVersion,
            @NotNull UUID subjectId,
            @NotNull SourceType type,
            @NotBlank @Size(max = 240) String title,
            UUID assetId,
            @Size(max = 2048) String originUrl,
            String rawText,
            String outline) {
        SourceCommand command() {
            return new SourceCommand(subjectId, type, title, assetId, originUrl, rawText, outline);
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
            SourceType type,
            String title,
            UUID assetId,
            String originUrl,
            String rawText,
            String outline,
            SourceIngestionStatus ingestionStatus,
            String safeErrorCode,
            String safeErrorDetail,
            Long assetSizeBytes,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        static Response from(SourceView view) {
            return new Response(view.id(), view.subjectId(), view.type(), view.title(), view.assetId(),
                    view.originUrl(), view.rawText(), view.outline(), view.ingestionStatus(), view.safeErrorCode(),
                    view.safeErrorDetail(), view.assetSizeBytes(), view.version(), view.createdAt(),
                    view.updatedAt(), view.deletedAt());
        }
    }
}
