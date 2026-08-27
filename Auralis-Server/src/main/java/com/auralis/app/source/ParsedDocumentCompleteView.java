package com.auralis.app.source;

import java.util.UUID;

public record ParsedDocumentCompleteView(
        UUID parsedDocumentId,
        ParsedDocumentStatus status,
        UUID generation,
        UUID ingestionJobId) {
}
