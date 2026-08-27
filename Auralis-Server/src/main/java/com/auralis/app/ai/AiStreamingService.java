package com.auralis.app.ai;

import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.Locale;

@Service
public class AiStreamingService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AiStreamingService.class);

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
        String content = command.content().trim();
        String clientRequestId = normalizeClientRequestId(command.clientRequestId());
        long requestStartedAt = System.nanoTime();
        LOGGER.info(
                "AI_STREAM_START userId={} conversationId={} requestedProvider={} retrievalEnabled={} topK={} contentLength={} clientRequestIdPresent={}",
                userId, command.conversationId(), command.provider() == null ? "DEFAULT" : command.provider(),
                command.retrievalEnabled(), command.topK(), content.length(), clientRequestId != null);
        int topK;
        try {
            topK = validateTopK(command.topK());
        } catch (DomainException exception) {
            LOGGER.warn(
                    "AI_STREAM_VALIDATION_FAILED userId={} conversationId={} errorCode={} exceptionType={} exceptionMessage={} rootCauseType={} rootCauseMessage={} elapsedMs={}",
                    userId, command.conversationId(), exception.code(), exceptionType(exception),
                    safeExceptionMessage(exception), rootCauseType(exception), rootCauseMessage(exception),
                    elapsedMillis(requestStartedAt));
            throw exception;
        }
        AiProviderType providerType;
        try {
            providerType = command.provider() == null ? defaultProvider() : command.provider();
        } catch (DomainException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_SELECTION_FAILED userId={} conversationId={} requestedProvider={} errorCode={} exceptionType={} exceptionMessage={} rootCauseType={} rootCauseMessage={} elapsedMs={}",
                    userId, command.conversationId(), command.provider() == null ? "DEFAULT" : command.provider(),
                    exception.code(), exceptionType(exception), safeExceptionMessage(exception),
                    rootCauseType(exception), rootCauseMessage(exception), elapsedMillis(requestStartedAt));
            throw exception;
        }

        ConversationService.ClientRequestReservation reservation = conversationService.reserveUserMessage(
                userId, command.conversationId(), firstTitle(content), content, clientRequestId);
        LOGGER.info(
                "AI_STREAM_RESERVATION userId={} conversationId={} userMessageId={} started={} assistantReplayed={}",
                userId, reservation.conversationId(), reservation.userMessage().id(), reservation.started(),
                reservation.assistantMessage() != null);
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
            LOGGER.info(
                    "AI_CHAT_PROVIDER_RESOLVED userId={} conversationId={} messageId={} provider={} model={} endpointHost={}",
                    userId, conversationId, userMessage.id(), providerType, settings.chatModel(),
                    safeHost(settings.credential().baseUrl()));
            ReadingContext readingContext = command.readingContext();
            List<Citation> citations;
            if (command.retrievalEnabled() || readingContext != null) {
                citations = retrieve(userId, conversationId, userMessage.id(), content, topK, readingContext);
            } else {
                citations = List.of();
            }
            for (Citation citation : citations) {
                sink.emit(new AiStreamEvent("citation", citation.chunkId().toString(), toView(citation)));
            }

            AiProviderPort provider = providerRegistry.require(providerType);
            ConversationView conversation = conversationService.get(userId, conversationId);
            int maxPromptChars = properties.ai().maxPromptChars();
            if (maxPromptChars < 1) maxPromptChars = 12000;
            AiProviderRequest request = new AiProviderRequest(
                    settings.chatModel(),
                    PromptAssembler.assemble(
                            "You are a precise study assistant. Answer using the user's conversation and the supplied personal knowledge context when relevant.",
                            conversation == null ? List.of() : conversation.messages(),
                            userMessage.id(),
                            readingContext == null ? null : readingContext.selectionText(),
                            citations,
                            content,
                            maxPromptChars),
                    0.2,
                    null);
            long providerStartedAt = System.nanoTime();
            LOGGER.info(
                    "AI_CHAT_PROVIDER_START userId={} conversationId={} messageId={} provider={} model={} promptMessageCount={} citationCount={}",
                    userId, conversationId, userMessage.id(), providerType, settings.chatModel(),
                    request.messages().size(), citations.size());
            int[] chunkCount = {0};
            AtomicBoolean completed = new AtomicBoolean(false);
            provider.streamInto(request, settings.credential(), chunk -> {
                if (chunk == null) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid chunk");
                }
                chunkCount[0]++;
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
            LOGGER.info(
                    "AI_CHAT_PROVIDER_SUCCESS userId={} conversationId={} messageId={} provider={} model={} chunks={} outputChars={} elapsedMs={}",
                    userId, conversationId, userMessage.id(), providerType, settings.chatModel(), chunkCount[0],
                    complete.length(), elapsedMillis(providerStartedAt));

            MessageView assistant = conversationService.appendAssistantReply(
                    userId, conversationId, userMessage.id(), complete.toString(),
                    AiMessageStatus.COMPLETED, settings.chatModel(), null);
            assistantPersisted = true;
            LOGGER.info(
                    "AI_STREAM_SUCCESS userId={} conversationId={} userMessageId={} assistantMessageId={} provider={} model={} outputChars={} elapsedMs={}",
                    userId, conversationId, userMessage.id(), assistant.id(), providerType, model, complete.length(),
                    elapsedMillis(requestStartedAt));
            sink.emit(new AiStreamEvent("message.completed", assistant.id().toString(),
                    Map.of("conversationId", conversationId, "messageId", assistant.id(),
                            "content", complete.toString())));
        } catch (AiStreamAbortException exception) {
            LOGGER.warn(
                    "AI_STREAM_INTERRUPTED userId={} conversationId={} userMessageId={} provider={} model={} partialOutputChars={} elapsedMs={} reason=CLIENT_DISCONNECTED",
                    userId, conversationId, userMessage.id(), providerType, model, complete.length(),
                    elapsedMillis(requestStartedAt));
            if (!assistantPersisted) {
                appendFailure(userId, conversationId, userMessage.id(), complete.toString(), AiMessageStatus.INTERRUPTED,
                        model, "CLIENT_DISCONNECTED");
            }
        } catch (DomainException exception) {
            LOGGER.warn(
                    "AI_STREAM_FAILED userId={} conversationId={} userMessageId={} provider={} model={} errorCode={} exceptionType={} exceptionMessage={} rootCauseType={} rootCauseMessage={} partialOutputChars={} elapsedMs={}",
                    userId, conversationId, userMessage.id(), providerType, model, exception.code(),
                    exceptionType(exception), safeExceptionMessage(exception), rootCauseType(exception),
                    rootCauseMessage(exception), complete.length(), elapsedMillis(requestStartedAt));
            if (!assistantPersisted) {
                appendFailure(userId, conversationId, userMessage.id(), complete.toString(), AiMessageStatus.FAILED,
                        model, exception.code());
            }
            sink.emit(new AiStreamEvent("message.error", userMessage.id().toString(),
                    Map.of("code", exception.code(), "detail", safeDetail(exception.getMessage()))));
        } catch (Exception exception) {
            LOGGER.error(
                    "AI_STREAM_FAILED_UNEXPECTED userId={} conversationId={} userMessageId={} provider={} model={} exceptionType={} exceptionMessage={} rootCauseType={} rootCauseMessage={} partialOutputChars={} elapsedMs={}",
                    userId, conversationId, userMessage.id(), providerType, model,
                    exceptionType(exception), safeExceptionMessage(exception), rootCauseType(exception),
                    rootCauseMessage(exception), complete.length(), elapsedMillis(requestStartedAt));
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

    private List<Citation> retrieve(
            UUID userId,
            UUID conversationId,
            UUID userMessageId,
            String content,
            int topK,
            ReadingContext readingContext) {
        long embeddingStartedAt = System.nanoTime();
        LOGGER.info(
                "AI_EMBEDDING_START userId={} conversationId={} messageId={} provider={} model={} endpointHost={} inputCount=1 inputChars={} topK={}",
                userId, conversationId, userMessageId, AiProviderType.SILICONFLOW, "<pending>", "<pending>",
                content.length(), topK);
        String embeddingModel = "<unknown>";
        try {
            AiSettingsService.ResolvedSettings embeddingSettings =
                    settingsService.resolve(userId, AiProviderType.SILICONFLOW);
            embeddingModel = embeddingSettings.credential().model();
            LOGGER.info(
                    "AI_EMBEDDING_CONFIG_RESOLVED userId={} conversationId={} messageId={} provider={} model={} endpointHost={}",
                    userId, conversationId, userMessageId, AiProviderType.SILICONFLOW, embeddingModel,
                    safeHost(embeddingSettings.credential().baseUrl()));
            EmbeddingProviderPort embeddingProvider = embeddingProviderRegistry.require(AiProviderType.SILICONFLOW);
            EmbeddingResult result = embeddingProvider.embed(List.of(content), embeddingSettings.credential());
            if (result == null || result.vectors().isEmpty()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned no vector");
            }
            int dimensions = result.vectors().get(0) == null ? 0 : result.vectors().get(0).size();
            LOGGER.info(
                    "AI_EMBEDDING_SUCCESS userId={} conversationId={} messageId={} provider={} model={} vectorCount={} dimensions={} elapsedMs={}",
                    userId, conversationId, userMessageId, AiProviderType.SILICONFLOW, embeddingModel,
                    result.vectors().size(), dimensions, elapsedMillis(embeddingStartedAt));
            List<Citation> citations = readingContext == null
                    ? retrievalService.retrieve(userId, result.vectors().get(0), topK)
                    : retrievalService.retrieve(userId, result.vectors().get(0), topK, readingContext, content);
            LOGGER.info(
                    "AI_RETRIEVAL_SUCCESS userId={} conversationId={} messageId={} topK={} citationCount={} elapsedMs={}",
                    userId, conversationId, userMessageId, topK, citations.size(), elapsedMillis(embeddingStartedAt));
            return citations;
        } catch (DomainException exception) {
            LOGGER.warn(
                    "AI_EMBEDDING_FAILED userId={} conversationId={} messageId={} provider={} model={} errorCode={} exceptionType={} exceptionMessage={} rootCauseType={} rootCauseMessage={} elapsedMs={}",
                    userId, conversationId, userMessageId, AiProviderType.SILICONFLOW, embeddingModel,
                    exception.code(), exceptionType(exception), safeExceptionMessage(exception),
                    rootCauseType(exception), rootCauseMessage(exception), elapsedMillis(embeddingStartedAt));
            throw exception;
        } catch (Exception exception) {
            LOGGER.error(
                    "AI_EMBEDDING_FAILED_UNEXPECTED userId={} conversationId={} messageId={} provider={} model={} exceptionType={} exceptionMessage={} rootCauseType={} rootCauseMessage={} elapsedMs={}",
                    userId, conversationId, userMessageId, AiProviderType.SILICONFLOW, embeddingModel,
                    exceptionType(exception), safeExceptionMessage(exception), rootCauseType(exception),
                    rootCauseMessage(exception), elapsedMillis(embeddingStartedAt));
            throw exception;
        }
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

    private String exceptionType(Throwable exception) {
        return exception == null ? "<none>" : exception.getClass().getName();
    }

    private String rootCauseType(Throwable exception) {
        Throwable rootCause = rootCause(exception);
        return rootCause == null ? "<none>" : exceptionType(rootCause);
    }

    private String rootCauseMessage(Throwable exception) {
        Throwable rootCause = rootCause(exception);
        return rootCause == null ? "<none>" : safeExceptionMessage(rootCause);
    }

    private Throwable rootCause(Throwable exception) {
        if (exception == null || exception.getCause() == null) {
            return null;
        }
        Throwable current = exception;
        Throwable cause = exception.getCause();
        int depth = 0;
        while (cause != null && cause != current && depth++ < 16) {
            current = cause;
            cause = current.getCause();
        }
        return current;
    }

    private String safeExceptionMessage(Throwable exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "<none>";
        }
        String message = exception.getMessage()
                .replaceAll("[\\r\\n\\t]+", " ")
                .trim()
                .replaceAll("(?i)(authorization\\s*:\\s*bearer\\s+)\\S+", "$1<redacted>")
                .trim()
                .replaceAll("(?i)(api[-_ ]?key|token|secret|password)\\s*[:=]\\s*\\S+",
                        "$1=<redacted>")
                .replaceAll("(?i)(https?://[^\\s?]+)\\?[^\\s]+", "$1?<redacted>");
        return message.length() > 300 ? message.substring(0, 300) + "..." : message;
    }

    private String safeHost(String baseUrl) {
        try {
            String host = URI.create(baseUrl == null ? "" : baseUrl.trim()).getHost();
            return host == null || host.isBlank() ? "<unknown>" : host;
        } catch (IllegalArgumentException exception) {
            return "<invalid>";
        }
    }

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
