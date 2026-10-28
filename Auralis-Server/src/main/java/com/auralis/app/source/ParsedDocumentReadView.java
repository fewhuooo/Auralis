package com.auralis.app.source;

import java.util.List;
import java.util.UUID;

/**
 * The server-side, revalidated view consumed by the indexing worker. The
 * payload bytes never leave the service boundary after validation.
 */
public record ParsedDocumentReadView(
        UUID parsedDocumentId,
        UUID sourceId,
        UUID ingestionRevision,
        UUID generation,
        String parserId,
        List<ParsedDocumentValidator.ValidatedBlock> blocks) {
    public ParsedDocumentReadView(UUID parsedDocumentId, UUID sourceId, UUID ingestionRevision,
                                  UUID generation, List<ParsedDocumentValidator.ValidatedBlock> blocks) {
        this(parsedDocumentId, sourceId, ingestionRevision, generation, "unknown", blocks);
    }
}
