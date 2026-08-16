package com.auralis.app.source;

import java.time.Instant;
import java.util.UUID;

public record AssetView(
        UUID id,
        String originalName,
        long sizeBytes,
        String mimeType,
        String sha256,
        AssetUploadStatus uploadStatus,
        Instant completedAt,
        Instant createdAt,
        Instant updatedAt) {
}
