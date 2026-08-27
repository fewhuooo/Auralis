package com.auralis.app.source;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ParsedDocumentUploadIntentView(
        UUID parsedDocumentId,
        UUID ingestionRevision,
        String uploadUrl,
        Map<String, String> headers,
        Instant expiresAt) {
}
