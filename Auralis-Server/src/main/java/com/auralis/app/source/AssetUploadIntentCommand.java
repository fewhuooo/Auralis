package com.auralis.app.source;

import java.util.UUID;

public record AssetUploadIntentCommand(
        long baseVersion,
        UUID clientImportId,
        String originalName,
        long sizeBytes,
        String mimeType,
        String sha256) {}
