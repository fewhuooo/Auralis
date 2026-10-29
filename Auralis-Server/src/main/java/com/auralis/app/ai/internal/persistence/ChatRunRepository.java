package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatRunRepository extends JpaRepository<ChatRunEntity, UUID> {
    Optional<ChatRunEntity> findByUserIdAndRequestId(UUID userId, String requestId);
    Optional<ChatRunEntity> findByIdAndUserIdAndConversationId(UUID id, UUID userId, UUID conversationId);
    List<ChatRunEntity> findAllByConversationIdAndUserIdOrderByCreatedAtAsc(UUID conversationId, UUID userId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ChatRunEntity r where r.id = :id and r.userId = :userId and r.conversationId = :conversationId")
    Optional<ChatRunEntity> findForUpdate(UUID id, UUID userId, UUID conversationId);
}
