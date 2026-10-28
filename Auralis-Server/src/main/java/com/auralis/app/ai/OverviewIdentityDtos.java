package com.auralis.app.ai;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public final class OverviewIdentityDtos {

    private OverviewIdentityDtos() {
    }

    public record OutlineIdentityInput(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int schemaVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @NotNull List<@Valid OutlineIdentityNodeInput> nodes) {
        public OutlineIdentityInput {
            nodes = nodes == null ? null : List.copyOf(nodes);
        }
    }

    public record OutlineIdentityNodeInput(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @NotNull @Size(min = 1, max = 2) List<@PositiveOrZero Integer> path,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"string", "null"}, format = "uuid")
            UUID nodeId) {
        public OutlineIdentityNodeInput {
            path = path == null ? null : List.copyOf(path);
        }
    }

    public record OutlineIdentityView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int schemaVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<OutlineIdentityNodeView> nodes) {
        public OutlineIdentityView {
            nodes = nodes == null ? null : List.copyOf(nodes);
        }
    }

    public record OutlineIdentityNodeView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Integer> path,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") UUID nodeId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long contentVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String contentHash,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<CanonicalSourceRefView> sourceRefs) {
        public OutlineIdentityNodeView {
            path = path == null ? null : List.copyOf(path);
            sourceRefs = sourceRefs == null ? null : List.copyOf(sourceRefs);
        }
    }

    public record OutlineProvenanceInput(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int schemaVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @NotNull List<@Valid OutlineProvenanceSectionInput> sections) {
        public OutlineProvenanceInput {
            sections = sections == null ? null : List.copyOf(sections);
        }
    }

    public record OutlineProvenanceSectionInput(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @NotNull @Size(min = 2, max = 2) List<@PositiveOrZero Integer> path,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @NotNull @Size(min = 1) List<@Valid OutlineProvenanceSourceRefInput> sourceRefs) {
        public OutlineProvenanceSectionInput {
            path = path == null ? null : List.copyOf(path);
            sourceRefs = sourceRefs == null ? null : List.copyOf(sourceRefs);
        }
    }

    public record OutlineProvenanceSourceRefInput(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") @NotNull UUID sourceId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") @NotNull UUID ingestionRevision,
            @Schema(nullable = true, types = {"string", "null"}, format = "uuid") UUID chunkId,
            @Schema(nullable = true, types = {"string", "null"}, format = "uuid") UUID generation,
            @Schema(nullable = true, types = {"integer", "null"}, format = "int32") Integer charStart,
            @Schema(nullable = true, types = {"integer", "null"}, format = "int32") Integer charEnd) {
    }

    public record OutlineProvenanceView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int schemaVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<OutlineProvenanceSectionView> sections) {
        public OutlineProvenanceView {
            sections = sections == null ? null : List.copyOf(sections);
        }
    }

    public record OutlineProvenanceSectionView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Integer> path,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<CanonicalSourceRefView> sourceRefs) {
        public OutlineProvenanceSectionView {
            path = path == null ? null : List.copyOf(path);
            sourceRefs = sourceRefs == null ? null : List.copyOf(sourceRefs);
        }
    }

    public record CanonicalSourceRefView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") UUID sourceId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") UUID ingestionRevision,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"string", "null"}, format = "uuid") UUID chunkId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"string", "null"}, format = "uuid") UUID generation,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"integer", "null"}, format = "int32") Integer charStart,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"integer", "null"}, format = "int32") Integer charEnd,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"string", "null"}) String contentHash,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProvenancePrecision precision,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"string", "null"}, format = "uuid") UUID parsedDocumentId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"string", "null"}) String parserId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ProvenanceLocationView> locations) {
        public CanonicalSourceRefView {
            locations = locations == null ? null : List.copyOf(locations);
        }
    }

    public record ProvenanceLocationView(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long blockOrdinal,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"integer", "null"}, format = "int64") Long pageNumber,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"integer", "null"}, format = "int64") Long anchorIndex,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
                    types = {"integer", "null"}, format = "int64") Long startLine,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int charStart,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int charEnd,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int blockCharStart,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int blockCharEnd) {
    }

    public enum ProvenancePrecision {
        SOURCE, CHUNK, BLOCK
    }
}
