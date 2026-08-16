package com.auralis.app.sync.internal.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChangeLogRepository extends JpaRepository<ChangeLogEntity, UUID> {

    Optional<ChangeLogEntity> findTopByUserIdOrderByCursorDesc(UUID userId);

    List<ChangeLogEntity> findByUserIdAndCursorGreaterThanOrderByCursorAsc(
            UUID userId, long cursor, Pageable pageable);

    Optional<ChangeLogEntity> findFirstByUserIdAndCreatedAtGreaterThanEqualOrderByCursorAsc(
            UUID userId, Instant cutoff);

    long deleteByCreatedAtBefore(Instant cutoff);
}
