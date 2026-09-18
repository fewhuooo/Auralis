package com.auralis.app.source.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

public interface SourceRepository extends JpaRepository<SourceEntity, UUID> {

    Optional<SourceEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<SourceEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select source from SourceEntity source "
            + "where source.id = :id and source.userId = :userId and source.deletedAt is null")
    Optional<SourceEntity> findForUpdateByIdAndUserIdAndDeletedAtIsNull(
            @org.springframework.data.repository.query.Param("id") UUID id,
            @org.springframework.data.repository.query.Param("userId") UUID userId);

    List<SourceEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    List<SourceEntity> findAllByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(UUID userId, UUID subjectId);

    List<SourceEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
            UUID userId, Pageable pageable);

    @Query("""
            select source from SourceEntity source
            where source.userId = :userId and source.deletedAt is null
              and (source.updatedAt < :updatedAt
                or (source.updatedAt = :updatedAt and source.id > :id))
            order by source.updatedAt desc, source.id asc
            """)
    List<SourceEntity> findPageAfter(
            @Param("userId") UUID userId,
            @Param("updatedAt") java.time.Instant updatedAt,
            @Param("id") UUID id,
            Pageable pageable);

    List<SourceEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);

    List<SourceEntity> findAllByDeletedAtBefore(Instant cutoff);

    boolean existsByAssetIdAndDeletedAtIsNull(UUID assetId);

    boolean existsByAssetIdAndDeletedAtAfter(UUID assetId, Instant cutoff);
}
