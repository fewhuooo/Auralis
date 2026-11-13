package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<ConversationEntity, UUID> {

    @Query("""
            select conversation from ConversationEntity conversation
            where conversation.userId = :userId and conversation.deletedAt is null
              and (conversation.purpose = com.auralis.app.ai.ConversationPurpose.GENERAL
                   or conversation.purpose is null)
            order by conversation.updatedAt desc, conversation.id asc
            """)
    List<ConversationEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    Optional<ConversationEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<ConversationEntity> findByUserIdAndClientRequestId(UUID userId, String clientRequestId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select conversation from ConversationEntity conversation
            where conversation.id = :id and conversation.userId = :userId
              and conversation.deletedAt is null
            """)
    Optional<ConversationEntity> findForUpdateByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);
}
