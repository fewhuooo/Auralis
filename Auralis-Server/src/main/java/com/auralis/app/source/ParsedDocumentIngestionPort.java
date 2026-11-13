package com.auralis.app.source;

import java.util.Optional;
import java.util.UUID;

/**
 * Source-owned boundary for scheduling parsed-document ingestion jobs.
 */
public interface ParsedDocumentIngestionPort {

    IngestionJobReference enqueueServerOwnedSource(
            UUID userId, UUID sourceId, UUID ingestionRevision);

    IngestionJobReference enqueueParsedDocument(
            UUID userId, UUID sourceId, UUID parsedDocumentId,
            UUID ingestionRevision, UUID generation);

    void resumeParsedDocument(
            UUID userId, UUID sourceId, UUID parsedDocumentId,
            UUID ingestionRevision, UUID generation);

    Optional<IngestionJobReference> findParsedDocumentJob(
            UUID userId, UUID sourceId, UUID ingestionRevision);
}
