package com.auralis.app.knowledge.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KnowledgeBlockRepository extends JpaRepository<KnowledgeBlockEntity, UUID> {

    Optional<KnowledgeBlockEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<KnowledgeBlockEntity> findByIdAndUserId(UUID id, UUID userId);

    List<KnowledgeBlockEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    List<KnowledgeBlockEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);
}
