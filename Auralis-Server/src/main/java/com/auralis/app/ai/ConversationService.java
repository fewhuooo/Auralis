package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.internal.persistence.ChatAttemptRepository;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.ChatRunRepository;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ChatAttemptRepository chatAttemptRepository;
    private final ChatRunRepository chatRunRepository;
    private final ObjectMapper objectMapper;

    public ConversationService(ConversationRepository conversationRepository, MessageRepository messageRepository,
            ChatAttemptRepository chatAttemptRepository, ChatRunRepository chatRunRepository, ObjectMapper objectMapper) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.chatAttemptRepository = chatAttemptRepository;
        this.chatRunRepository = chatRunRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ConversationView create(UUID userId, ConversationCommand command) {
        if (command.baseVersion() != 0) {
            throw new DomainException("VALIDATION_FAILED", "Create baseVersion must be 0");
        }
        ConversationPurpose purpose = command.purpose() == null
                ? ConversationPurpose.GENERAL : command.purpose();
        if (purpose != ConversationPurpose.GENERAL || command.sourceId() != null) {
            throw new DomainException("VALIDATION_FAILED", "Chat conversations use GENERAL purpose; pass reading scope per request");
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
        ConversationEntity entity = new ConversationEntity(UUID.randomUUID(), userId, title, clientRequestId,
                purpose, command.sourceId());
        entity.enableChatProtocolOne();
        entity.markChatScopeUnbound();
        return toView(conversationRepository.saveAndFlush(entity), List.of());
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
        requireChatProtocol(entity);
        List<MessageView> messages = messageRepository
                .findAllByConversationIdAndUserIdOrderByMessageSequenceAsc(conversationId, userId).stream()
                .peek(message -> {
                    if (!Short.valueOf((short) 1).equals(message.getChatProtocolVersion())) {
                        throw new DomainException("CHAT_PROTOCOL_UNSUPPORTED", "Conversation contains messages from an unsupported Chat protocol");
                    }
                })
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
        if (entity.getActiveChatRunId() != null) {
            throw new DomainException("CHAT_RUN_ACTIVE", "An active Chat run must settle before deleting this conversation");
        }
        entity.softDelete();
        conversationRepository.saveAndFlush(entity);
    }


    private ConversationEntity requireActive(UUID userId, UUID conversationId) {
        return conversationRepository.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
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
                entity.getPurpose(), entity.getSourceId(), entity.getChatProtocolVersion(),
                Short.valueOf((short) 1).equals(entity.getChatProtocolVersion()), activeRun(entity),
                entity.getChatScopeState(), chatScope(entity));
    }

    private ChatConversationScope chatScope(ConversationEntity entity) {
        if (entity.getChatScopeState() != ChatConversationScopeState.BOUND || entity.getChatScopeJson() == null) return null;
        try { return objectMapper.readValue(entity.getChatScopeJson(), ChatConversationScope.class); }
        catch (RuntimeException exception) {
            throw new DomainException("CHAT_CONTEXT_UNAVAILABLE", "Chat conversation scope is unavailable");
        }
    }

    private ActiveChatRunView activeRun(ConversationEntity conversation) {
        if (conversation.getActiveChatRunId() == null
                || !Short.valueOf((short) 1).equals(conversation.getChatProtocolVersion())) return null;
        ChatRunEntity run = chatRunRepository.findByIdAndUserIdAndConversationId(
                conversation.getActiveChatRunId(), conversation.getUserId(), conversation.getId()).orElse(null);
        if (run == null || run.getCurrentAttemptId() == null) return null;
        ChatAttemptEntity attempt = chatAttemptRepository.findByIdAndRunIdAndUserId(
                run.getCurrentAttemptId(), run.getId(), conversation.getUserId()).orElse(null);
        if (attempt == null) return null;
        try {
            var type = new TypeReference<List<java.util.Map<String, Object>>>() {};
            List<java.util.Map<String, Object>> parts = objectMapper.readValue(attempt.getPublicPartsJson(), type);
            List<java.util.Map<String, Object>> trace = objectMapper.readValue(attempt.getToolTraceJson(), type);
            return new ActiveChatRunView(run.getId(), run.getUserMessageId(), run.getCurrentAttemptId(),
                    run.getCurrentReplyMessageId(), run.getStatus(), true, parts, trace, run.getUpdatedAt());
        } catch (RuntimeException exception) {
            throw new DomainException("CHAT_SNAPSHOT_UNAVAILABLE", "Chat snapshot is unavailable");
        }
    }

    private void requireVersion(ConversationEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Conversation version does not match",
                    toView(entity, List.of()));
        }
    }

    private MessageView toView(MessageEntity entity) {
        List<java.util.Map<String, Object>> parts = List.of();
        ChatAttemptEntity attempt = chatAttemptRepository.findByReplyMessageId(entity.getId()).orElse(null);
        if (attempt != null) {
            try {
                parts = objectMapper.readValue(attempt.getPublicPartsJson(),
                        new TypeReference<List<java.util.Map<String, Object>>>() {});
            } catch (RuntimeException exception) {
                throw new DomainException("CHAT_SNAPSHOT_UNAVAILABLE", "Chat snapshot is unavailable");
            }
        }
        return new MessageView(entity.getId(), entity.getMessageSequence(), entity.getRole(), entity.getStatus(),
                entity.getContent(), entity.getModel(), entity.getErrorCode(), entity.getCreatedAt(), parts,
                entity.getChatProtocolVersion());
    }

    private void requireChatProtocol(ConversationEntity entity) {
        if (!Short.valueOf((short) 1).equals(entity.getChatProtocolVersion())) {
            throw new DomainException("CHAT_PROTOCOL_UNSUPPORTED", "This conversation cannot be displayed by Chat protocol 1");
        }
    }
}
