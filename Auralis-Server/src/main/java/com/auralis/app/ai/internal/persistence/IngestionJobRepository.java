package com.auralis.app.ai.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.domain.Pageable;

import com.auralis.app.ai.IngestionJobStatus;

public interface IngestionJobRepository extends JpaRepository<IngestionJobEntity, UUID> {

    Optional<IngestionJobEntity> findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(UUID userId, UUID sourceId);

    Optional<IngestionJobEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<IngestionJobEntity> findFirstByUserIdAndSourceIdAndIngestionRevisionOrderByCreatedAtDesc(
            UUID userId, UUID sourceId, UUID ingestionRevision);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select job from IngestionJobEntity job
            where job.status = :pendingStatus
               or (job.status in :leasedStatuses
                   and job.leaseUntil is not null
                   and job.leaseUntil <= :now)
            order by job.createdAt asc, job.id asc
            """)
    List<IngestionJobEntity> findNextClaimable(
            @Param("now") Instant now,
            @Param("pendingStatus") IngestionJobStatus pendingStatus,
            @Param("leasedStatuses") List<IngestionJobStatus> leasedStatuses,
            Pageable pageable);
}
