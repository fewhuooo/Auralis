package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.internal.persistence.IngestionJobEntity;

import java.util.UUID;

public record IngestionClaim(
        UUID jobId,
        UUID userId,
        UUID sourceId,
        UUID generation,
        UUID ingestionRevision,
        UUID parsedDocumentId,
        int attemptCount) {

    public static IngestionClaim from(IngestionJobEntity job) {
        return new IngestionClaim(
                job.getId(), job.getUserId(), job.getSourceId(), job.getGeneration(),
                job.getIngestionRevision(), job.getParsedDocumentId(), job.getAttemptCount());
    }
}
