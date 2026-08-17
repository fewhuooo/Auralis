package com.auralis.app.knowledge.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KnowledgeBlockRepository extends JpaRepository<KnowledgeBlockEntity, UUID> {

    Optional<KnowledgeBlockEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<KnowledgeBlockEntity> findByIdAndUserId(UUID id, UUID userId);

    List<KnowledgeBlockEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

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
