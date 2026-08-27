package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.ParsedDocumentStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;
import java.time.Instant;

public interface ParsedDocumentRepository extends JpaRepository<ParsedDocumentEntity, UUID> {

    Optional<ParsedDocumentEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<ParsedDocumentEntity> findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatus(
            UUID userId, UUID sourceId, UUID ingestionRevision, ParsedDocumentStatus status);

    List<ParsedDocumentEntity> findAllByUserIdAndSourceIdAndIngestionRevision(
            UUID userId, UUID sourceId, UUID ingestionRevision);

    List<ParsedDocumentEntity> findAllByStatusInAndUpdatedAtBefore(
            List<ParsedDocumentStatus> statuses, Instant cutoff);
}
