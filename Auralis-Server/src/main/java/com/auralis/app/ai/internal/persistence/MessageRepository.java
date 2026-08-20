package com.auralis.app.ai.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<MessageEntity, UUID> {

    List<MessageEntity> findAllByConversationIdAndUserIdOrderByMessageSequenceAsc(UUID conversationId, UUID userId);

    Optional<MessageEntity> findByUserIdAndClientRequestId(UUID userId, String clientRequestId);

    Optional<MessageEntity> findByConversationIdAndUserIdAndReplyToMessageId(
            UUID conversationId, UUID userId, UUID replyToMessageId);
}
