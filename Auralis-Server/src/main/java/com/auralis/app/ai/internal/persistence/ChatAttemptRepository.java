package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatAttemptRepository extends JpaRepository<ChatAttemptEntity, UUID> {
    Optional<ChatAttemptEntity> findByUserIdAndRequestId(UUID userId, String requestId);
    Optional<ChatAttemptEntity> findByIdAndRunIdAndUserId(UUID id, UUID runId, UUID userId);
    Optional<ChatAttemptEntity> findByReplyMessageId(UUID replyMessageId);
    boolean existsByIdAndRunIdAndUserIdAndStatus(UUID id, UUID runId, UUID userId, String status);
    List<ChatAttemptEntity> findAllByRunIdOrderByAttemptNoAsc(UUID runId);
    List<ChatAttemptEntity> findAllByRunIdAndUserIdOrderByAttemptNoAsc(UUID runId, UUID userId);
    List<ChatAttemptEntity> findAllByStatusIn(List<String> statuses);
    @Query("select a from ChatAttemptEntity a where a.status in :statuses and a.deadlineAt <= :now "
            + "and a.workerInstanceId <> :workerInstanceId order by a.deadlineAt asc, a.id asc")
    List<ChatAttemptEntity> findExpiredForeignAttempts(@Param("statuses") List<String> statuses,
            @Param("now") java.time.Instant now, @Param("workerInstanceId") String workerInstanceId,
            Pageable pageable);
    Optional<ChatAttemptEntity> findTopByRunIdOrderByAttemptNoDesc(UUID runId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ChatAttemptEntity a where a.id = :id and a.runId = :runId and a.userId = :userId")
    Optional<ChatAttemptEntity> findForUpdate(UUID id, UUID runId, UUID userId);
}
