package com.auralis.app.sync;

import tools.jackson.databind.JsonNode;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SyncDtos {

    private SyncDtos() {
    }

    public record PushRequest(
            @NotNull UUID serverDeviceId,
            @NotNull @Size(max = 200) List<@Valid MutationRequest> mutations) {
        public List<SyncMutation> toMutations() {
            return mutations.stream().map(MutationRequest::toMutation).toList();
        }
    }

    public record MutationRequest(
            @NotBlank @Size(max = 128) String clientMutationId,
            @NotNull SyncResourceType resourceType,
            @NotNull UUID resourceId,
            @NotNull SyncMutationType mutationType,
            @Min(0) long baseVersion,
            JsonNode payload) {
        SyncMutation toMutation() {
            return new SyncMutation(clientMutationId, resourceType, resourceId, mutationType, baseVersion, payload);
        }
    }

    public record PushResponse(List<MutationResponse> results, String serverCursor) {
        public PushResponse {
            results = List.copyOf(results);
        }
    }

    public record MutationResponse(
            String clientMutationId,
            MutationDecision decision,
            SyncResourceType resourceType,
            UUID resourceId,
            SyncMutationType mutationType,
            String changeCursor,
            Object current,
            String code,
            Instant recordedAt) {
    }

    public record PullResponse(
            List<ChangeResponse> changes,
            String nextCursor,
            boolean hasMore,
            boolean resetRequired) {
        public PullResponse {
            changes = List.copyOf(changes);
        }
    }

    public record ChangeResponse(
            String cursor,
            SyncResourceType resourceType,
            UUID resourceId,
            SyncChangeMutationType mutationType,
            long version,
            Instant deletedAt,
            JsonNode payload,
            Instant createdAt) {
        static ChangeResponse from(ChangeLogEntry entry, ObjectMapper objectMapper) {
            JsonNode payload;
            try {
                payload = entry.payload() == null
                        ? objectMapper.getNodeFactory().nullNode()
                        : objectMapper.readTree(entry.payload());
            } catch (JacksonException exception) {
                payload = objectMapper.getNodeFactory().textNode(entry.payload());
            }
            return new ChangeResponse(entry.cursor() == 0 ? null : new SyncCursor(entry.cursor()).encode(),
                    entry.resourceType(), entry.resourceId(), SyncChangeMutationType.valueOf(entry.mutationType().name()), entry.version(),
                    entry.deletedAt(), payload, entry.createdAt());
        }
    }

    public record SnapshotResponse(
            String snapshotCursor,
            List<?> subjects,
            List<?> sources,
            List<?> knowledgeBlocks,
            List<?> tasks,
            List<?> relations) {
        public SnapshotResponse {
            subjects = List.copyOf(subjects);
            sources = List.copyOf(sources);
            knowledgeBlocks = List.copyOf(knowledgeBlocks);
            tasks = List.copyOf(tasks);
            relations = List.copyOf(relations);
        }
    }
}
