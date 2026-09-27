package com.auralis.app.source.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

public interface SourceRepository extends JpaRepository<SourceEntity, UUID> {

    Optional<SourceEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<SourceEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    @Query("select source.subjectId from SourceEntity source where source.id = :id and source.userId = :userId")
    Optional<UUID> findSubjectIdByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select source from SourceEntity source "
            + "where source.id = :id and source.userId = :userId and source.deletedAt is null")
    Optional<SourceEntity> findForUpdateByIdAndUserIdAndDeletedAtIsNull(
            @Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select source from SourceEntity source where source.id = :id and source.userId = :userId")
    Optional<SourceEntity> findForUpdateByIdAndUserId(
            @Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select source from SourceEntity source where source.userId = :userId "
            + "and source.subjectId = :subjectId and source.deletedAt is null order by source.id asc")
    List<SourceEntity> findAllForUpdateByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
            @Param("userId") UUID userId, @Param("subjectId") UUID subjectId);

    List<SourceEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    List<SourceEntity> findAllByUserIdAndIdInAndDeletedAtIsNull(UUID userId, Collection<UUID> ids);

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
