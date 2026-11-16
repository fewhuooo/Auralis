package com.auralis.app.review.internal.persistence;

import org.springframework.data.domain.Pageable;
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

    @Query("""
            select rs as state, kb.version as knowledgeBlockVersion
            from ReviewStateEntity rs
            join KnowledgeBlockEntity kb on kb.id = rs.knowledgeBlockId and kb.userId = rs.userId
            join SubjectEntity s on s.id = kb.subjectId and s.userId = kb.userId
            where rs.userId = :userId and kb.subjectId = coalesce(:subjectId, kb.subjectId)
              and kb.deletedAt is null and s.deletedAt is null
              and rs.needsLearning = false and rs.mastered = false and rs.dueAt <= :at
              and (:firstPage = true or rs.dueAt > :afterDueAt
                   or (rs.dueAt = :afterDueAt and rs.knowledgeBlockId > :afterId))
            order by rs.dueAt, rs.knowledgeBlockId
            """)
    List<QueueRow> findDueQueue(@Param("userId") UUID userId, @Param("subjectId") UUID subjectId,
                                @Param("at") Instant at, @Param("firstPage") boolean firstPage,
                                @Param("afterDueAt") Instant afterDueAt, @Param("afterId") UUID afterId,
                                Pageable pageable);

    interface QueueRow {
        ReviewStateEntity getState();
        long getKnowledgeBlockVersion();
    }
}
