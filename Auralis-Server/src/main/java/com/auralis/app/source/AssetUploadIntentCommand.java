package com.auralis.app.source;

public record AssetUploadIntentCommand(
        long baseVersion,
        String originalName,
        long sizeBytes,
        String mimeType,
        String sha256) {
}
