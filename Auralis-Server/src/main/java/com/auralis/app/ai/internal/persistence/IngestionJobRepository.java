package com.auralis.app.ai.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IngestionJobRepository extends JpaRepository<IngestionJobEntity, UUID> {

    Optional<IngestionJobEntity> findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(UUID userId, UUID sourceId);

    Optional<IngestionJobEntity> findByIdAndUserId(UUID id, UUID userId);
}
