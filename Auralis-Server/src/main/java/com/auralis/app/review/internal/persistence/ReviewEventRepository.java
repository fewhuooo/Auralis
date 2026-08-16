package com.auralis.app.review.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReviewEventRepository extends JpaRepository<ReviewEventEntity, UUID> {
    Optional<ReviewEventEntity> findByUserIdAndClientEventId(UUID userId, UUID clientEventId);
    List<ReviewEventEntity> findAllByUserIdAndKnowledgeBlockIdOrderByReviewedAtAscIdAsc(UUID userId, UUID knowledgeBlockId);
    long countByUserIdAndReviewedAtLessThanEqual(UUID userId, java.time.Instant at);
}
