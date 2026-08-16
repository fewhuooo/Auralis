package com.auralis.app.ai.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SourceChunkRepository extends JpaRepository<SourceChunkEntity, UUID> {

    List<SourceChunkEntity> findAllByUserId(UUID userId);

    List<SourceChunkEntity> findAllByUserIdAndSourceIdOrderByOrdinalAsc(UUID userId, UUID sourceId);

    void deleteAllByUserIdAndSourceId(UUID userId, UUID sourceId);
}
