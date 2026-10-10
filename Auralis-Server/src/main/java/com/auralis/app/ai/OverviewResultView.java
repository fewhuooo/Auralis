package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;

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
        Instant updatedAt) {
}
