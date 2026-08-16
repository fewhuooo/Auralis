package com.auralis.app.ai;

import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AiStreamingService {

    private final ConversationService conversationService;
    private final AiSettingsService settingsService;
    private final AiProviderRegistry providerRegistry;

    public AiStreamingService(
            ConversationService conversationService,
            AiSettingsService settingsService,
            AiProviderRegistry providerRegistry) {
        this.conversationService = conversationService;
        this.settingsService = settingsService;
        this.providerRegistry = providerRegistry;
    }

    @Transactional
    public List<AiStreamEvent> stream(UUID userId, AiMessageCommand command) {
        if (command.content() == null || command.content().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "Message content is required");
        }
        AiProviderType providerType = command.provider() == null ? AiProviderType.DEEPSEEK : command.provider();
        ConversationView conversation = command.conversationId() == null
                ? conversationService.create(userId, new ConversationCommand(firstTitle(command.content()), 0L))
                : conversationService.get(userId, command.conversationId());
        MessageView userMessage = conversationService.appendMessage(
                userId, conversation.id(), AiMessageRole.USER, command.content(), AiMessageStatus.COMPLETED, null, null);

        List<AiStreamEvent> events = new ArrayList<>();
        events.add(new AiStreamEvent("message.started", userMessage.id().toString(),
                Map.of("conversationId", conversation.id(), "messageId", userMessage.id())));
        StringBuilder complete = new StringBuilder();
        try {
            AiSettingsService.ResolvedSettings settings = settingsService.resolve(userId, providerType);
            AiProviderPort provider = providerRegistry.require(providerType);
            AiProviderRequest request = new AiProviderRequest(
                    settings.chatModel(),
                    List.of(new AiProviderRequest.Message(AiMessageRole.USER, command.content())),
                    0.2,
                    null);
            List<AiProviderChunk> chunks = provider.stream(request, settings.credential());
            if (chunks == null || chunks.isEmpty()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned no content");
            }
            for (AiProviderChunk chunk : chunks) {
                if (chunk.content() == null || chunk.content().isEmpty()) {
                    continue;
                }
                complete.append(chunk.content());
                events.add(new AiStreamEvent("message.delta", userMessage.id().toString(), chunk.content()));
            }
            if (complete.isEmpty()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned blank content");
            }
            MessageView assistant = conversationService.appendMessage(
                    userId, conversation.id(), AiMessageRole.ASSISTANT, complete.toString(),
                    AiMessageStatus.COMPLETED, settings.chatModel(), null);
            events.add(new AiStreamEvent("message.completed", assistant.id().toString(),
                    Map.of("conversationId", conversation.id(), "messageId", assistant.id(), "content", complete.toString())));
            return List.copyOf(events);
        } catch (DomainException exception) {
            appendFailure(userId, conversation.id(), null, exception.code());
            events.add(new AiStreamEvent("message.error", userMessage.id().toString(),
                    Map.of("code", exception.code(), "detail", safeDetail(exception.getMessage()))));
            return List.copyOf(events);
        } catch (Exception exception) {
            appendFailure(userId, conversation.id(), null, "MODEL_PROVIDER_ERROR");
            events.add(new AiStreamEvent("message.error", userMessage.id().toString(),
                    Map.of("code", "MODEL_PROVIDER_ERROR", "detail", "AI provider request failed")));
            return List.copyOf(events);
        }
    }

    private void appendFailure(UUID userId, UUID conversationId, String model, String errorCode) {
        conversationService.appendMessage(userId, conversationId, AiMessageRole.ASSISTANT, "",
                AiMessageStatus.FAILED, model, errorCode);
    }

    private String firstTitle(String content) {
        String normalized = content.trim();
        return normalized.length() > 60 ? normalized.substring(0, 60) : normalized;
    }

    private String safeDetail(String detail) {
        return detail == null || detail.isBlank() ? "AI provider request failed" : detail;
    }
}
