package com.auralis.app.source;

import java.time.Instant;
import java.util.UUID;

public record SourceView(
        UUID id,
        UUID subjectId,
        SourceType type,
        String title,
        UUID assetId,
        String originUrl,
        String rawText,
        String outline,
        SourceIngestionStatus ingestionStatus,
        UUID ingestionRevision,
        String safeErrorCode,
        String safeErrorDetail,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt,
        Long assetSizeBytes) {

    /**
     * Compatibility constructor for callers that only have the core Source fields.
     */
    public SourceView(
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
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        this(id, subjectId, type, title, assetId, originUrl, rawText, outline, ingestionStatus,
                null, safeErrorCode, safeErrorDetail, version, createdAt, updatedAt, deletedAt, null);
    }
}
