package com.auralis.app.subject;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SubjectDtos {

    private SubjectDtos() {
    }

    public record CreateRequest(
            @NotNull Long baseVersion,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 2000) String description,
            @Size(max = 64) String iconKey,
            @Size(max = 128) String sortKey) {
        SubjectCommand command() {
            return new SubjectCommand(name, description, iconKey, sortKey);
        }
    }

    public record UpdateRequest(
            @NotNull Long baseVersion,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 2000) String description,
            @Size(max = 64) String iconKey,
            @Size(max = 128) String sortKey) {
        SubjectCommand command() {
            return new SubjectCommand(name, description, iconKey, sortKey);
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
            String name,
            String description,
            String iconKey,
            String sortKey,
            boolean defaultSubject,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        static Response from(SubjectView view) {
            return new Response(view.id(), view.name(), view.description(), view.iconKey(), view.sortKey(),
                    view.defaultSubject(), view.version(), view.createdAt(), view.updatedAt(), view.deletedAt());
        }
    }
}
