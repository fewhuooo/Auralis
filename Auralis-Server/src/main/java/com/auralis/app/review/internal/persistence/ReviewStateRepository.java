package com.auralis.app.review.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReviewStateRepository extends JpaRepository<ReviewStateEntity, UUID> {
    Optional<ReviewStateEntity> findByUserIdAndKnowledgeBlockId(UUID userId, UUID knowledgeBlockId);
    List<ReviewStateEntity> findTop200ByUserIdAndDueAtLessThanEqualOrderByDueAtAscIdAsc(UUID userId, Instant at);
    long countByUserIdAndDueAtLessThanEqual(UUID userId, Instant at);
}
