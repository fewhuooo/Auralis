package com.auralis.app.knowledge.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KnowledgeBlockRepository extends JpaRepository<KnowledgeBlockEntity, UUID> {

    Optional<KnowledgeBlockEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<KnowledgeBlockEntity> findByIdAndUserId(UUID id, UUID userId);

    @Query("select block.subjectId from KnowledgeBlockEntity block where block.id = :id and block.userId = :userId")
    Optional<UUID> findSubjectIdByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("""
            select block.subjectId as subjectId, block.sourceId as sourceId from KnowledgeBlockEntity block
            where block.id = :id and block.userId = :userId
            """)
    Optional<MutationLinks> findMutationLinks(@Param("id") UUID id, @Param("userId") UUID userId);

    interface MutationLinks {
        UUID getSubjectId();

        UUID getSourceId();
    }

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select block from KnowledgeBlockEntity block where block.id = :id and block.userId = :userId "
            + "and block.deletedAt is null")
    Optional<KnowledgeBlockEntity> findActiveForUpdate(
            @Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select block from KnowledgeBlockEntity block where block.id = :id and block.userId = :userId")
    Optional<KnowledgeBlockEntity> findForUpdate(
            @Param("id") UUID id, @Param("userId") UUID userId);


    List<KnowledgeBlockEntity> findAllByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(UUID userId, UUID subjectId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select block from KnowledgeBlockEntity block where block.userId = :userId "
            + "and block.subjectId = :subjectId and block.deletedAt is null order by block.id asc")
    List<KnowledgeBlockEntity> findAllForUpdateByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
            @Param("userId") UUID userId, @Param("subjectId") UUID subjectId);

    List<KnowledgeBlockEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
            UUID userId, Pageable pageable);

    @Query("""
            select block from KnowledgeBlockEntity block
            where block.userId = :userId and block.deletedAt is null
              and (block.updatedAt < :updatedAt
                or (block.updatedAt = :updatedAt and block.id > :id))
            order by block.updatedAt desc, block.id asc
            """)
    List<KnowledgeBlockEntity> findPageAfter(
            @Param("userId") UUID userId,
            @Param("updatedAt") java.time.Instant updatedAt,
            @Param("id") UUID id,
            Pageable pageable);

    List<KnowledgeBlockEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);
}
