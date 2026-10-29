package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatActivityRepository extends JpaRepository<ChatActivityEntity, UUID> {
    Optional<ChatActivityEntity> findByIdAndUserId(UUID id, UUID userId);
    Optional<ChatActivityEntity> findByIdAndRunIdAndUserId(UUID id, UUID runId, UUID userId);
    List<ChatActivityEntity> findAllByRunIdOrderByCreatedAtAsc(UUID runId);
    Optional<ChatActivityEntity> findByReplyRunIdAndUserId(UUID replyRunId, UUID userId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ChatActivityEntity a where a.id = :id and a.runId = :runId and a.userId = :userId")
    Optional<ChatActivityEntity> findForUpdate(UUID id, UUID runId, UUID userId);
}
