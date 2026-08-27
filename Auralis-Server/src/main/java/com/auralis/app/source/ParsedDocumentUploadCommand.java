package com.auralis.app.source;

import java.util.UUID;

public record ParsedDocumentUploadCommand(
        UUID ingestionRevision,
        int schemaVersion,
        String parserId,
        String parserVersion,
        String normalizationVersion,
        String ocrModelVersion,
        String sourceAssetSha256,
        String payloadSha256,
        long sizeBytes) {
}
