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
        String safeErrorCode,
        String safeErrorDetail,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt) {
}
