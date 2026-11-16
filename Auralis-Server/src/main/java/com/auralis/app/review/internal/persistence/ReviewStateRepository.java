package com.auralis.app.review.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;

public interface ReviewStateRepository extends JpaRepository<ReviewStateEntity, UUID> {
    Optional<ReviewStateEntity> findByUserIdAndKnowledgeBlockId(UUID userId, UUID knowledgeBlockId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from ReviewStateEntity state where state.userId = :userId "
            + "and state.knowledgeBlockId = :knowledgeBlockId")
    Optional<ReviewStateEntity> findForUpdateByUserIdAndKnowledgeBlockId(
            @Param("userId") UUID userId, @Param("knowledgeBlockId") UUID knowledgeBlockId);

    @Query(value = "select rs.* from review_states rs "
            + "join knowledge_blocks kb on kb.id = rs.knowledge_block_id and kb.user_id = rs.user_id "
            + "join subjects s on s.id = kb.subject_id and s.user_id = kb.user_id "
            + "where rs.user_id = :userId and kb.subject_id = :subjectId "
            + "and s.deleted_at is null and kb.deleted_at is null "
            + "and (:afterKnowledgeBlockId is null or kb.id > :afterKnowledgeBlockId) "
            + "order by kb.id asc limit :limit",
            nativeQuery = true)
    List<ReviewStateEntity> findForActiveSubjectAfter(@Param("userId") UUID userId,
                                                       @Param("subjectId") UUID subjectId,
                                                       @Param("afterKnowledgeBlockId") UUID afterKnowledgeBlockId,
                                                       @Param("limit") int limit);
}
