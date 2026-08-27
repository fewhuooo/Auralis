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
        ConversationPurpose purpose = command.purpose() == null
                ? ConversationPurpose.GENERAL : command.purpose();
        if (purpose == ConversationPurpose.READING_SESSION && command.sourceId() == null) {
            throw new DomainException("VALIDATION_FAILED", "Reading sessions require a sourceId");
        }
        if (purpose == ConversationPurpose.GENERAL && command.sourceId() != null) {
            throw new DomainException("VALIDATION_FAILED", "General conversations cannot be bound to a sourceId");
        }
        String title = command.title() == null || command.title().isBlank() ? null : command.title().trim();
        String clientRequestId = normalizeClientRequestId(command.clientRequestId());
        if (clientRequestId != null) {
            Optional<ConversationEntity> existing = conversationRepository
                    .findByUserIdAndClientRequestId(userId, clientRequestId);
            if (existing.isPresent()) {
                return toView(existing.get(), List.of());
            }
        }
        return toView(conversationRepository.saveAndFlush(
                new ConversationEntity(UUID.randomUUID(), userId, title, clientRequestId, purpose, command.sourceId())), List.of());
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
        ConversationEntity conversation = requireActiveForUpdate(userId, conversationId);
        return appendMessageLocked(conversation, userId, role, content, status, model, errorCode,
                normalizeClientRequestId(clientRequestId), null);
    }

    /**
     * Reserves the USER message in one short, conversation-row-locked transaction.
     * Streaming and provider I/O happen only after this transaction has committed.
     */
    @Transactional
    public ClientRequestReservation reserveUserMessage(
            UUID userId,
            UUID requestedConversationId,
            String titleIfCreating,
            String content,
            String clientRequestId) {
        String normalizedClientRequestId = normalizeClientRequestId(clientRequestId);
        if (normalizedClientRequestId != null) {
            Optional<ClientRequestReplay> existing = findClientRequestReplay(userId, normalizedClientRequestId);
            if (existing.isPresent()) {
                return ClientRequestReservation.replay(existing.get());
            }
        }

        ConversationView created = requestedConversationId == null
                ? create(userId, new ConversationCommand(titleIfCreating, 0L, normalizedClientRequestId))
                : null;
        UUID conversationId = created == null ? requestedConversationId : created.id();
        ConversationEntity conversation = requireActiveForUpdate(userId, conversationId);

        // A second caller with the same conversation waits on the row lock and
        // observes the first caller's reservation before it can call a provider.
        if (normalizedClientRequestId != null) {
            Optional<ClientRequestReplay> existing = findClientRequestReplay(userId, normalizedClientRequestId);
            if (existing.isPresent()) {
                return ClientRequestReservation.replay(existing.get());
            }
        }

        MessageView userMessage = appendMessageLocked(conversation, userId, AiMessageRole.USER, content,
                AiMessageStatus.COMPLETED, null, null, normalizedClientRequestId, null);
        return ClientRequestReservation.started(conversationId, userMessage);
    }

    @Transactional
    public MessageView appendAssistantReply(
            UUID userId,
            UUID conversationId,
            UUID replyToMessageId,
            String content,
            AiMessageStatus status,
            String model,
            String errorCode) {
        ConversationEntity conversation = requireActiveForUpdate(userId, conversationId);
        return appendMessageLocked(conversation, userId, AiMessageRole.ASSISTANT, content, status, model, errorCode,
                null, replyToMessageId);
    }

    @Transactional(readOnly = true)
    public Optional<ClientRequestReplay> findClientRequestReplay(UUID userId, String clientRequestId) {
        String normalized = normalizeClientRequestId(clientRequestId);
        if (normalized == null) {
            return Optional.empty();
        }
        return messageRepository.findByUserIdAndClientRequestId(userId, normalized)
                .map(userMessage -> new ClientRequestReplay(
                        userMessage.getConversationId(), toView(userMessage), messageRepository
                                .findByConversationIdAndUserIdAndReplyToMessageId(
                                        userMessage.getConversationId(), userId, userMessage.getId())
                                .map(this::toView)
                                .orElse(null)));
    }

    private MessageView appendMessageLocked(
            ConversationEntity conversation,
            UUID userId,
            AiMessageRole role,
            String content,
            AiMessageStatus status,
            String model,
            String errorCode,
            String clientRequestId,
            UUID replyToMessageId) {
        if (content == null || (content.isBlank() && status == AiMessageStatus.COMPLETED)) {
            throw new IllegalArgumentException("Message content must not be blank");
        }
        long nextSequence = conversation.allocateNextMessageSequence();
        conversationRepository.saveAndFlush(conversation);
        MessageEntity message = new MessageEntity(
                UUID.randomUUID(), conversation.getId(), userId, nextSequence, role, status,
                content.trim(), model, errorCode, null, clientRequestId, replyToMessageId);
        return toView(messageRepository.saveAndFlush(message));
    }

    private ConversationEntity requireActiveEntity(UUID userId, UUID conversationId) {
        return conversationRepository.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Conversation was not found"));
    }

    private ConversationEntity requireActive(UUID userId, UUID conversationId) {
        return requireActiveEntity(userId, conversationId);
    }

    private ConversationEntity requireActiveForUpdate(UUID userId, UUID conversationId) {
        return conversationRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Conversation was not found"));
    }

    private String normalizeClientRequestId(String clientRequestId) {
        if (clientRequestId == null || clientRequestId.isBlank()) {
            return null;
        }
        String normalized = clientRequestId.trim();
        if (normalized.length() > 128) {
            throw new DomainException("VALIDATION_FAILED", "clientRequestId is too long");
        }
        return normalized;
    }

    private ConversationView toView(ConversationEntity entity, List<MessageView> messages) {
        return new ConversationView(entity.getId(), entity.getTitle(), messages,
                entity.getCreatedAt(), entity.getUpdatedAt(), entity.getDeletedAt(), entity.getVersion(),
                entity.getPurpose(), entity.getSourceId());
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

    public record ClientRequestReservation(
            UUID conversationId,
            MessageView userMessage,
            MessageView assistantMessage,
            boolean started) {
        static ClientRequestReservation started(UUID conversationId, MessageView userMessage) {
            return new ClientRequestReservation(conversationId, userMessage, null, true);
        }

        static ClientRequestReservation replay(ClientRequestReplay replay) {
            return new ClientRequestReservation(replay.conversationId(), replay.userMessage(), replay.assistantMessage(), false);
        }
    }
}
