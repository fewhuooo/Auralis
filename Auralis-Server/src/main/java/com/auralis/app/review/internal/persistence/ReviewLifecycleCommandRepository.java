package com.auralis.app.review.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReviewLifecycleCommandRepository extends JpaRepository<ReviewLifecycleCommandEntity, UUID> {
    Optional<ReviewLifecycleCommandEntity> findByUserIdAndClientCommandId(UUID userId, UUID clientCommandId);

    Optional<ReviewLifecycleCommandEntity> findTopByUserIdAndKnowledgeBlockIdOrderByOccurredAtDescIdDesc(
            UUID userId, UUID knowledgeBlockId);

    List<ReviewLifecycleCommandEntity> findAllByUserIdAndKnowledgeBlockIdOrderByOccurredAtAscIdAsc(
            UUID userId, UUID knowledgeBlockId);
}
