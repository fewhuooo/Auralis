package com.auralis.app.source;

import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** Deletes unneeded payload objects while retaining the audit row. */
@Service
public class ParsedDocumentCleanupService {

    private static final Logger log = LoggerFactory.getLogger(ParsedDocumentCleanupService.class);

    private final ParsedDocumentRepository repository;
    private final AssetStoragePort assetStorage;
    private final Clock clock;
    private final Duration uploadTimeout;
    private final Duration metadataRetention;

    public ParsedDocumentCleanupService(
            ParsedDocumentRepository repository,
            AssetStoragePort assetStorage,
            Clock clock,
            @Value("${auralis.ai.parsed-document-upload-timeout-hours:24}") long uploadTimeoutHours,
            @Value("${auralis.ai.parsed-document-retention-days:30}") long retentionDays) {
        this.repository = repository;
        this.assetStorage = assetStorage;
        this.clock = clock;
        this.uploadTimeout = Duration.ofHours(Math.max(1, uploadTimeoutHours));
        this.metadataRetention = Duration.ofDays(Math.max(1, retentionDays));
    }

    @Transactional
    public int purgeExpired(Instant now) {
        int purged = 0;
        purged += purge(repository.findAllByStatusInAndUpdatedAtBefore(
                List.of(ParsedDocumentStatus.UPLOADING, ParsedDocumentStatus.REJECTED),
                now.minus(uploadTimeout)));
        purged += purge(repository.findAllByStatusInAndUpdatedAtBefore(
                List.of(ParsedDocumentStatus.SUPERSEDED), now.minus(metadataRetention)));
        return purged;
    }

    @Scheduled(
            fixedDelayString = "${auralis.ai.parsed-document-cleanup-delay-millis:3600000}",
            initialDelayString = "${auralis.ai.parsed-document-cleanup-initial-delay-millis:60000}")
    public void scheduledPurgeExpired() {
        purgeExpired(clock.instant());
    }

    private int purge(List<ParsedDocumentEntity> documents) {
        int purged = 0;
        for (ParsedDocumentEntity document : documents) {
            if (document.getObjectDeletedAt() != null) {
                continue;
            }
            try {
                assetStorage.deleteObject(document.getObjectKey());
                document.markObjectDeleted();
                repository.save(document);
                purged++;
                log.info("PARSED_DOCUMENT_OBJECT_PURGED parsedDocumentId={} status={}",
                        document.getId(), document.getStatus());
            } catch (RuntimeException exception) {
                log.warn("PARSED_DOCUMENT_OBJECT_PURGE_FAILED parsedDocumentId={} errorType={}",
                        document.getId(), exception.getClass().getSimpleName());
            }
        }
        return purged;
    }
}
