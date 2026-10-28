package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceView;
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
        List<OverviewChapter> outline,
        OverviewSummary summary,
        List<OverviewSourceManifestEntry> outlineSourceManifest,
        List<OverviewSourceManifestEntry> summarySourceManifest,
        String outlineInputFingerprint,
        String summaryInputFingerprint,
        Instant outlineGeneratedAt,
        Instant summaryGeneratedAt,
        Instant updatedAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean identityReady,
        @JsonInclude(JsonInclude.Include.ALWAYS)
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
        OutlineIdentityView outlineIdentity,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(nullable = true, types = {"object", "null"})
        OutlineProvenanceView outlineProvenance,
        @JsonInclude(JsonInclude.Include.ALWAYS)
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
        OverviewInputDescriptor outlineInputDescriptor,
        @JsonInclude(JsonInclude.Include.ALWAYS)
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, types = {"object", "null"})
        OverviewInputDescriptor summaryInputDescriptor) {
    public OverviewResultView(UUID id, String scopeType, UUID sourceId, UUID subjectId,
                              UUID ingestionRevision, long version, long outlineVersion, long summaryVersion,
                              int schemaVersion, String title, List<OverviewChapter> outline,
                              OverviewSummary summary,
                              List<OverviewSourceManifestEntry> outlineSourceManifest,
                              List<OverviewSourceManifestEntry> summarySourceManifest,
                              String outlineInputFingerprint, String summaryInputFingerprint,
                              Instant outlineGeneratedAt, Instant summaryGeneratedAt, Instant updatedAt,
                              boolean identityReady, OutlineIdentityView outlineIdentity,
                              OutlineProvenanceView outlineProvenance) {
        this(id, scopeType, sourceId, subjectId, ingestionRevision, version, outlineVersion, summaryVersion,
                schemaVersion, title, outline, summary, outlineSourceManifest, summarySourceManifest,
                outlineInputFingerprint, summaryInputFingerprint, outlineGeneratedAt, summaryGeneratedAt,
                updatedAt, identityReady, outlineIdentity, outlineProvenance, null, null);
    }

    public OverviewResultView(UUID id, String scopeType, UUID sourceId, UUID subjectId,
                              UUID ingestionRevision, long version, long outlineVersion, long summaryVersion,
                              int schemaVersion, String title, List<OverviewChapter> outline,
                              OverviewSummary summary,
                              List<OverviewSourceManifestEntry> outlineSourceManifest,
                              List<OverviewSourceManifestEntry> summarySourceManifest,
                              String outlineInputFingerprint, String summaryInputFingerprint,
                              Instant outlineGeneratedAt, Instant summaryGeneratedAt, Instant updatedAt) {
        this(id, scopeType, sourceId, subjectId, ingestionRevision, version, outlineVersion, summaryVersion,
                schemaVersion, title, outline, summary, outlineSourceManifest, summarySourceManifest,
                outlineInputFingerprint, summaryInputFingerprint, outlineGeneratedAt, summaryGeneratedAt,
                updatedAt, false, null, null);
    }
}
