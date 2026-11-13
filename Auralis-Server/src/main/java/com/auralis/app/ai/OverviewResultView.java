package com.auralis.app.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OverviewResultView(
        UUID id,
        String scopeType,
        UUID sourceId,
        UUID subjectId,
        UUID ingestionRevision,
        long version,
        long outlineVersion,
        long summaryVersion,
        int schemaVersion,
        String title,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String outlineMarkdown,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String summaryMarkdown,
        List<OverviewSourceManifestEntry> outlineSourceManifest,
        List<OverviewSourceManifestEntry> summarySourceManifest,
        String outlineInputFingerprint,
        String summaryInputFingerprint,
        Instant outlineGeneratedAt,
        Instant summaryGeneratedAt,
        Instant updatedAt,
        @JsonInclude(JsonInclude.Include.ALWAYS)
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
        OverviewInputDescriptor outlineInputDescriptor,
        @JsonInclude(JsonInclude.Include.ALWAYS)
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
        OverviewInputDescriptor summaryInputDescriptor) {
}
