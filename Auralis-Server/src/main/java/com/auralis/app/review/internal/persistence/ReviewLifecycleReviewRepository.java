package com.auralis.app.review.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReviewLifecycleReviewRepository extends JpaRepository<ReviewLifecycleReviewEntity, UUID> {
    Optional<ReviewLifecycleReviewEntity> findByUserIdAndKnowledgeBlockIdAndReviewId(
            UUID userId, UUID knowledgeBlockId, UUID reviewId);

    List<ReviewLifecycleReviewEntity> findAllByUserIdAndKnowledgeBlockIdOrderBySelectedAtAscReviewIdAsc(
            UUID userId, UUID knowledgeBlockId);

    @Modifying
    @Query("update ReviewLifecycleReviewEntity review set review.resolution = 'SUPERSEDED' "
            + "where review.userId = :userId and review.knowledgeBlockId = :knowledgeBlockId "
            + "and review.effectiveRating is null")
    int supersedeUnresolved(@Param("userId") UUID userId, @Param("knowledgeBlockId") UUID knowledgeBlockId);
}
