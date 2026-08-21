package com.auralis.app.ai;

import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.Locale;

@Service
public class AiStreamingService {

    private final ConversationService conversationService;
    private final AiSettingsService settingsService;
    private final AiProviderRegistry providerRegistry;
    private final RetrievalService retrievalService;
    private final EmbeddingProviderRegistry embeddingProviderRegistry;
    private final AuralisProperties properties;

    public AiStreamingService(
            ConversationService conversationService,
            AiSettingsService settingsService,
            AiProviderRegistry providerRegistry,
            RetrievalService retrievalService,
            EmbeddingProviderRegistry embeddingProviderRegistry,
            AuralisProperties properties) {
        this.conversationService = conversationService;
        this.settingsService = settingsService;
        this.providerRegistry = providerRegistry;
        this.retrievalService = retrievalService;
        this.embeddingProviderRegistry = embeddingProviderRegistry;
        this.properties = properties;
    }

    public List<AiStreamEvent> stream(UUID userId, AiMessageCommand command) {
        List<AiStreamEvent> events = new ArrayList<>();
        stream(userId, command, events::add);
        return List.copyOf(events);
    }

    public void stream(UUID userId, AiMessageCommand command, AiStreamSink sink) {
        if (command == null || command.content() == null || command.content().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "Message content is required");
        }
        int topK = validateTopK(command.topK());
        AiProviderType providerType = command.provider() == null ? defaultProvider() : command.provider();
        String content = command.content().trim();
        String clientRequestId = normalizeClientRequestId(command.clientRequestId());

        ConversationService.ClientRequestReservation reservation = conversationService.reserveUserMessage(
                userId, command.conversationId(), firstTitle(content), content, clientRequestId);
        if (!reservation.started()) {
            replay(new ConversationService.ClientRequestReplay(
                    reservation.conversationId(), reservation.userMessage(), reservation.assistantMessage()), sink);
            return;
        }
        UUID conversationId = reservation.conversationId();
        MessageView userMessage = reservation.userMessage();
        StringBuilder complete = new StringBuilder();
        String model = null;
        boolean assistantPersisted = false;
        try {
            sink.emit(new AiStreamEvent("message.started", userMessage.id().toString(),
                    Map.of("conversationId", conversationId, "messageId", userMessage.id())));

            AiSettingsService.ResolvedSettings settings = settingsService.resolve(userId, providerType);
            model = settings.chatModel();
            List<Citation> citations = command.retrievalEnabled()
                    ? retrieve(userId, content, topK)
                    : List.of();
            for (Citation citation : citations) {
                sink.emit(new AiStreamEvent("citation", citation.chunkId().toString(), toView(citation)));
            }

            AiProviderPort provider = providerRegistry.require(providerType);
            AiProviderRequest request = new AiProviderRequest(
                    settings.chatModel(),
                    promptMessages(content, citations),
                    0.2,
                    null);
            AtomicBoolean completed = new AtomicBoolean(false);
            provider.streamInto(request, settings.credential(), chunk -> {
                if (chunk == null) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid chunk");
                }
                if (chunk.content() != null && !chunk.content().isEmpty()) {
                    complete.append(chunk.content());
                    sink.emit(new AiStreamEvent("message.delta", userMessage.id().toString(), chunk.content()));
                }
                if (chunk.complete()) {
                    completed.set(true);
                }
            });
            if (!completed.get() || complete.isEmpty()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned blank content");
            }

            MessageView assistant = conversationService.appendAssistantReply(
                    userId, conversationId, userMessage.id(), complete.toString(),
                    AiMessageStatus.COMPLETED, settings.chatModel(), null);
            assistantPersisted = true;
            sink.emit(new AiStreamEvent("message.completed", assistant.id().toString(),
                    Map.of("conversationId", conversationId, "messageId", assistant.id(),
                            "content", complete.toString())));
        } catch (AiStreamAbortException exception) {
            if (!assistantPersisted) {
                appendFailure(userId, conversationId, userMessage.id(), complete.toString(), AiMessageStatus.INTERRUPTED,
                        model, "CLIENT_DISCONNECTED");
            }
        } catch (DomainException exception) {
            if (!assistantPersisted) {
                appendFailure(userId, conversationId, userMessage.id(), complete.toString(), AiMessageStatus.FAILED,
                        model, exception.code());
            }
            sink.emit(new AiStreamEvent("message.error", userMessage.id().toString(),
                    Map.of("code", exception.code(), "detail", safeDetail(exception.getMessage()))));
        } catch (Exception exception) {
            if (!assistantPersisted) {
                appendFailure(userId, conversationId, userMessage.id(), complete.toString(), AiMessageStatus.FAILED,
                        model, "MODEL_PROVIDER_ERROR");
            }
            sink.emit(new AiStreamEvent("message.error", userMessage.id().toString(),
                    Map.of("code", "MODEL_PROVIDER_ERROR", "detail", "AI provider request failed")));
        }
    }

    private void replay(ConversationService.ClientRequestReplay replay, AiStreamSink sink) {
        MessageView userMessage = replay.userMessage();
        sink.emit(new AiStreamEvent("message.started", userMessage.id().toString(),
                Map.of("conversationId", replay.conversationId(), "messageId", userMessage.id())));
        MessageView assistant = replay.assistantMessage();
        if (assistant != null && assistant.status() == AiMessageStatus.COMPLETED
                && assistant.content() != null && !assistant.content().isBlank()) {
            sink.emit(new AiStreamEvent("message.delta", userMessage.id().toString(), assistant.content()));
            sink.emit(new AiStreamEvent("message.completed", assistant.id().toString(),
                    Map.of("conversationId", replay.conversationId(), "messageId", assistant.id(),
                            "content", assistant.content())));
            return;
        }
        String errorCode = assistant == null || assistant.errorCode() == null
                ? "REQUEST_IN_PROGRESS"
                : assistant.errorCode();
        sink.emit(new AiStreamEvent("message.error", userMessage.id().toString(),
                    Map.of("code", errorCode, "detail", "The previous AI request is still processing or did not complete")));
    }

    private List<Citation> retrieve(UUID userId, String content, int topK) {
        AiSettingsService.ResolvedSettings embeddingSettings =
                settingsService.resolve(userId, AiProviderType.SILICONFLOW);
        EmbeddingProviderPort embeddingProvider = embeddingProviderRegistry.require(AiProviderType.SILICONFLOW);
        EmbeddingResult result = embeddingProvider.embed(List.of(content), embeddingSettings.credential());
        if (result == null || result.vectors().isEmpty()) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned no vector");
        }
        return retrievalService.retrieve(userId, result.vectors().get(0), topK);
    }

    private List<AiProviderRequest.Message> promptMessages(String content, List<Citation> citations) {
        List<AiProviderRequest.Message> messages = new ArrayList<>();
        if (!citations.isEmpty()) {
            String context = citations.stream()
                    .map(citation -> "[source=" + citation.sourceId() + ", chunk=" + citation.chunkId() + "] "
                            + citation.excerpt())
                    .reduce((left, right) -> left + "\n" + right)
                    .orElse("");
            messages.add(new AiProviderRequest.Message(
                    AiMessageRole.SYSTEM,
                    "Use the following personal knowledge context when it is relevant:\n" + context));
        }
        messages.add(new AiProviderRequest.Message(AiMessageRole.USER, content));
        return messages;
    }

    private CitationView toView(Citation citation) {
        return new CitationView(citation.sourceId(), citation.chunkId(), citation.ordinal(), citation.title(),
                citation.excerpt(), citation.similarity());
    }

    private int validateTopK(Integer requestedTopK) {
        int maxTopK = properties.ai().maxRetrievedChunks();
        int topK = requestedTopK == null ? maxTopK : requestedTopK;
        if (topK < 1 || topK > maxTopK) {
            throw new DomainException("VALIDATION_FAILED", "topK must be between 1 and maxRetrievedChunks");
        }
        return topK;
    }

    private void appendFailure(
            UUID userId,
            UUID conversationId,
            UUID replyToMessageId,
            String content,
            AiMessageStatus status,
            String model,
            String errorCode) {
        conversationService.appendAssistantReply(userId, conversationId, replyToMessageId,
                content == null ? "" : content, status, model, errorCode);
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

    private AiProviderType defaultProvider() {
        String configured = properties.ai().defaultProvider();
        if (configured == null || configured.isBlank()) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI default provider is not configured");
        }
        try {
            return AiProviderType.valueOf(configured.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI default provider is invalid");
        }
    }

    private String firstTitle(String content) {
        String normalized = content.trim();
        return normalized.length() > 60 ? normalized.substring(0, 60) : normalized;
    }

    private String safeDetail(String detail) {
        return detail == null || detail.isBlank() ? "AI provider request failed" : detail;
    }
}
