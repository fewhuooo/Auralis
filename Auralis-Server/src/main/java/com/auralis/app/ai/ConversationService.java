package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;

    public ConversationService(ConversationRepository conversationRepository, MessageRepository messageRepository) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
    }

    @Transactional
    public ConversationView create(UUID userId, ConversationCommand command) {
        if (command.baseVersion() != 0) {
            throw new DomainException("VALIDATION_FAILED", "Create baseVersion must be 0");
        }
        String title = command.title() == null || command.title().isBlank() ? null : command.title().trim();
        return toView(conversationRepository.save(new ConversationEntity(UUID.randomUUID(), userId, title)), List.of());
    }

    @Transactional(readOnly = true)
    public List<ConversationView> list(UUID userId) {
        return conversationRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId).stream()
                .map(entity -> toView(entity, List.of()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ConversationView get(UUID userId, UUID conversationId) {
        ConversationEntity entity = requireActive(userId, conversationId);
        List<MessageView> messages = messageRepository
                .findAllByConversationIdAndUserIdOrderByMessageSequenceAsc(conversationId, userId).stream()
                .map(this::toView)
                .toList();
        return toView(entity, messages);
    }

    @Transactional
    public void delete(UUID userId, UUID conversationId, long baseVersion) {
        if (baseVersion < 0) {
            throw new DomainException("VALIDATION_FAILED", "baseVersion must not be negative");
        }
        ConversationEntity entity = requireActive(userId, conversationId);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        conversationRepository.saveAndFlush(entity);
    }

    @Transactional
    public MessageView appendMessage(
            UUID userId,
            UUID conversationId,
            AiMessageRole role,
            String content,
            AiMessageStatus status,
            String model,
            String errorCode) {
        return appendMessage(userId, conversationId, role, content, status, model, errorCode, null);
    }

    @Transactional
    public MessageView appendMessage(
            UUID userId,
            UUID conversationId,
            AiMessageRole role,
            String content,
            AiMessageStatus status,
            String model,
            String errorCode,
            String clientRequestId) {
        if (content == null || (content.isBlank() && status == AiMessageStatus.COMPLETED)) {
            throw new IllegalArgumentException("Message content must not be blank");
        }
        ConversationEntity conversation = conversationRepository
                .findForUpdateByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Conversation was not found"));
        String normalizedClientRequestId = clientRequestId == null || clientRequestId.isBlank()
                ? null
                : clientRequestId.trim();
        long nextSequence = conversation.allocateNextMessageSequence();
        conversationRepository.saveAndFlush(conversation);
        MessageEntity message = new MessageEntity(
                UUID.randomUUID(), conversationId, userId, nextSequence, role, status,
                content.trim(), model, errorCode, null, normalizedClientRequestId);
        return toView(messageRepository.save(message));
    }

    @Transactional(readOnly = true)
    public Optional<ClientRequestReplay> findClientRequestReplay(UUID userId, String clientRequestId) {
        String normalized = clientRequestId == null || clientRequestId.isBlank()
                ? null
                : clientRequestId.trim();
        if (normalized == null) {
            return Optional.empty();
        }
        return messageRepository.findByUserIdAndClientRequestId(userId, normalized)
                .flatMap(message -> {
                    try {
                        ConversationView conversation = get(userId, message.getConversationId());
                        MessageView userMessage = conversation.messages().stream()
                                .filter(candidate -> candidate.id().equals(message.getId()))
                                .findFirst()
                                .orElse(null);
                        if (userMessage == null) {
                            return Optional.empty();
                        }
                        MessageView assistantMessage = conversation.messages().stream()
                                .filter(candidate -> candidate.messageSequence() > userMessage.messageSequence())
                                .filter(candidate -> candidate.role() == AiMessageRole.ASSISTANT)
                                .findFirst()
                                .orElse(null);
                        return Optional.of(new ClientRequestReplay(
                                conversation.id(), userMessage, assistantMessage));
                    } catch (DomainException exception) {
                        return Optional.empty();
                    }
                });
    }

    private ConversationEntity requireActiveEntity(UUID userId, UUID conversationId) {
        return conversationRepository.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Conversation was not found"));
    }

    private ConversationEntity requireActive(UUID userId, UUID conversationId) {
        return requireActiveEntity(userId, conversationId);
    }

    private ConversationView toView(ConversationEntity entity, List<MessageView> messages) {
        return new ConversationView(entity.getId(), entity.getTitle(), messages,
                entity.getCreatedAt(), entity.getUpdatedAt(), entity.getDeletedAt(), entity.getVersion());
    }

    private void requireVersion(ConversationEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Conversation version does not match",
                    toView(entity, List.of()));
        }
    }

    private MessageView toView(MessageEntity entity) {
        return new MessageView(entity.getId(), entity.getMessageSequence(), entity.getRole(), entity.getStatus(),
                entity.getContent(), entity.getModel(), entity.getErrorCode(), entity.getCreatedAt());
    }

    public record ClientRequestReplay(
            UUID conversationId,
            MessageView userMessage,
            MessageView assistantMessage) {
    }
}
