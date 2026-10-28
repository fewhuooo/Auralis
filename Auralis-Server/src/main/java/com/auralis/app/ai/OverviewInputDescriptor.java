package com.auralis.app.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.UUID;

/** Explicit input contract for one saved Overview part. */
public record OverviewInputDescriptor(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Origin origin,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String scopeType,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") UUID scopeId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<UUID> sourceIds,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SourceRevision> sourceRevisions,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<OverviewPartInputUnit> rawUnits,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<OverviewSourceManifestEntry> overviewParts,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String inputFingerprint) {

    public enum Origin { SOURCE_REVISION, SOURCE_OVERVIEW_PARTS, SOURCE_CONTENT }

    public OverviewInputDescriptor {
        sourceIds = sourceIds == null ? List.of() : List.copyOf(sourceIds);
        sourceRevisions = sourceRevisions == null ? List.of() : List.copyOf(sourceRevisions);
        rawUnits = rawUnits == null ? List.of() : List.copyOf(rawUnits);
        overviewParts = overviewParts == null ? List.of() : List.copyOf(overviewParts);
    }

    public record SourceRevision(UUID sourceId, UUID ingestionRevision) { }

    /** Bounded V36 raw unit manifest; it deliberately contains no source text. */
    public record OverviewPartInputUnit(String alias, UUID sourceId, UUID sourceRevision, UUID chunkId,
                                        UUID generation, int ordinal, String contentHash,
                                        int charStart, int charEnd) { }
}
