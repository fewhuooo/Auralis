package com.auralis.app.relation.internal.persistence;

import com.auralis.app.relation.RelationNodeType;
import com.auralis.app.relation.RelationType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;

public interface RelationRepository extends JpaRepository<RelationEntity, UUID> {

    Optional<RelationEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<RelationEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    @Query("select relation.sourceType as sourceType, relation.sourceId as sourceId, "
            + "relation.targetType as targetType, relation.targetId as targetId, "
            + "relation.type as type, relation.label as label from RelationEntity relation "
            + "where relation.id = :id and relation.userId = :userId")
    Optional<RelationEndpointSnapshot> findEndpointSnapshotByIdAndUserId(
            @Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select relation from RelationEntity relation where relation.id = :id and relation.userId = :userId")
    Optional<RelationEntity> findForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);

    List<RelationEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select relation from RelationEntity relation where relation.userId = :userId "
            + "and relation.deletedAt is null order by relation.id asc")
    List<RelationEntity> findAllActiveForUpdateOrderByIdAsc(@Param("userId") UUID userId);

    List<RelationEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
            UUID userId, Pageable pageable);

    @Query("""
            select relation from RelationEntity relation
            where relation.userId = :userId and relation.deletedAt is null
              and (relation.updatedAt < :updatedAt
                or (relation.updatedAt = :updatedAt and relation.id > :id))
            order by relation.updatedAt desc, relation.id asc
            """)
    List<RelationEntity> findPageAfter(
            @Param("userId") UUID userId,
            @Param("updatedAt") Instant updatedAt,
            @Param("id") UUID id,
            Pageable pageable);

    List<RelationEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);

    @Query("""
            select count(r) > 0 from RelationEntity r
            where r.userId = :userId and r.deletedAt is null and r.type = :type
              and r.sourceType = :sourceType and r.sourceId = :sourceId
              and r.targetType = :targetType and r.targetId = :targetId
            """)
    boolean existsActiveDuplicate(
            @Param("userId") UUID userId,
            @Param("sourceType") RelationNodeType sourceType,
            @Param("sourceId") UUID sourceId,
            @Param("targetType") RelationNodeType targetType,
            @Param("targetId") UUID targetId,
            @Param("type") RelationType type);

    @Query("""
            select count(r) > 0 from RelationEntity r
            where r.userId = :userId and r.deletedAt is null and r.id <> :excludedId
              and r.type = :type and r.sourceType = :sourceType and r.sourceId = :sourceId
              and r.targetType = :targetType and r.targetId = :targetId
            """)
    boolean existsActiveDuplicateExcluding(
            @Param("userId") UUID userId,
            @Param("excludedId") UUID excludedId,
            @Param("sourceType") RelationNodeType sourceType,
            @Param("sourceId") UUID sourceId,
            @Param("targetType") RelationNodeType targetType,
            @Param("targetId") UUID targetId,
            @Param("type") RelationType type);

    @Modifying
    @Query("""
            update RelationEntity r
               set r.deletedAt = :deletedAt, r.version = r.version + 1
             where r.userId = :userId and r.deletedAt is null
               and ((r.sourceType = :nodeType and r.sourceId = :nodeId)
                 or (r.targetType = :nodeType and r.targetId = :nodeId))
            """)
    int softDeleteForEndpoint(
            @Param("userId") UUID userId,
            @Param("nodeType") RelationNodeType nodeType,
            @Param("nodeId") UUID nodeId,
            @Param("deletedAt") Instant deletedAt);
}
