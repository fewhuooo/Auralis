package com.auralis.app.ai.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<MessageEntity, UUID> {

    @Query("select max(message.messageSequence) from MessageEntity message where message.conversationId = :conversationId")
    Optional<Long> findMaxMessageSequence(UUID conversationId);

    List<MessageEntity> findAllByConversationIdAndUserIdOrderByMessageSequenceAsc(UUID conversationId, UUID userId);
}
