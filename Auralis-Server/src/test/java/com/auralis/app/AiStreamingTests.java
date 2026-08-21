package com.auralis.app;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiMessageCommand;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiStreamAbortException;
import com.auralis.app.ai.AiStreamingService;
import com.auralis.app.ai.AiStreamEvent;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiStreamingTests {

    @Mock
    private ConversationService conversationService;

    @Mock
    private AiSettingsService settingsService;

    @Mock
    private AiProviderRegistry providerRegistry;

    @Mock
    private RetrievalService retrievalService;

    @Mock
    private EmbeddingProviderRegistry embeddingProviderRegistry;

    @Mock
    private EmbeddingProviderPort embeddingProvider;

    @Mock
    private AuralisProperties properties;

    @Mock
    private AuralisProperties.Ai aiProperties;

    @InjectMocks
    private AiStreamingService streamingService;

    @BeforeEach
    void reservesAUserMessageForProviderFlowByDefault() {
        lenient().when(conversationService.reserveUserMessage(any(), any(), anyString(), anyString(), anyString()))
                .thenAnswer(invocation -> {
                    UUID conversationId = invocation.getArgument(1);
                    String content = invocation.getArgument(3);
                    return new ConversationService.ClientRequestReservation(
                            conversationId,
                            new MessageView(UUID.randomUUID(), 1, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                                    content, null, null, null),
                            null,
                            true);
                });
        lenient().when(conversationService.appendAssistantReply(any(), any(), any(), anyString(), any(), any(), any()))
                .thenAnswer(invocation -> new MessageView(
                        UUID.randomUUID(), 2, AiMessageRole.ASSISTANT, invocation.getArgument(4),
                        invocation.getArgument(3), invocation.getArgument(5), invocation.getArgument(6), null));
    }

    @Test
    void emitsOrderedEventsAndPersistsCompletedAssistantMessage() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        AiProviderPort provider = new FakeStreamingProvider();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);
        when(settingsService.resolve(userId, AiProviderType.DEEPSEEK))
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.DEEPSEEK, "deepseek-chat", new AiCredential("https://provider.test", "secret")));
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);

        List<AiStreamEvent> events = streamingService.stream(userId,
                new AiMessageCommand(conversationId, "hello", AiProviderType.DEEPSEEK, false, 3, "request-1"));

        assertThat(events).extracting(AiStreamEvent::event)
                .containsExactly("message.started", "message.delta", "message.delta", "message.completed");
        assertThat(events.get(1).data()).isEqualTo("hello ");
        assertThat(events.get(2).data()).isEqualTo("world");
        verify(conversationService).appendAssistantReply(eq(userId), eq(conversationId), any(),
                eq("hello world"), eq(AiMessageStatus.COMPLETED), eq("deepseek-chat"), eq(null));
    }

    @Test
    void omittedProviderUsesConfiguredDefaultProvider() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        AiProviderPort provider = new FakeStreamingProvider();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);
        when(aiProperties.defaultProvider()).thenReturn("OPENAI_COMPATIBLE");
        when(settingsService.resolve(userId, AiProviderType.OPENAI_COMPATIBLE))
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.OPENAI_COMPATIBLE, "gpt-4o-mini",
                        new AiCredential("https://provider.test", "secret")));
        when(providerRegistry.require(AiProviderType.OPENAI_COMPATIBLE)).thenReturn(provider);

        List<AiStreamEvent> events = streamingService.stream(userId,
                new AiMessageCommand(conversationId, "hello", null, false, 3, "request-default"));

        assertThat(events).extracting(AiStreamEvent::event)
                .containsExactly("message.started", "message.delta", "message.delta", "message.completed");
        verify(settingsService).resolve(userId, AiProviderType.OPENAI_COMPATIBLE);
        verify(providerRegistry).require(AiProviderType.OPENAI_COMPATIBLE);
    }

    @Test
    void retrievalSettingsFlowIntoProviderRequestAndCitationEvent() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        AtomicReference<AiProviderRequest> request = new AtomicReference<>();
        AiProviderPort provider = new CapturingStreamingProvider(request);
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);
        when(settingsService.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-chat", new AiCredential("https://provider.test", "secret")));
        when(settingsService.resolve(userId, AiProviderType.SILICONFLOW)).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.SILICONFLOW, "embedding-model", new AiCredential("https://embedding.test", "secret")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        List<Double> vector = java.util.Collections.nCopies(1024, 1.0);
        when(embeddingProvider.embed(List.of("hello"), new AiCredential("https://embedding.test", "secret")))
                .thenReturn(new EmbeddingResult(List.of(vector)));
        when(retrievalService.retrieve(userId, vector, 2)).thenReturn(List.of(
                new Citation(sourceId, chunkId, 3, "Algebra", "linear context", 0.91)));
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);

        List<AiStreamEvent> events = streamingService.stream(userId,
                new AiMessageCommand(conversationId, "hello", AiProviderType.DEEPSEEK, true, 2,
                        "request-retrieval"));

        assertThat(events).extracting(AiStreamEvent::event)
                .containsExactly("message.started", "citation", "message.delta", "message.completed");
        assertThat(request.get().messages()).anySatisfy(message ->
                assertThat(message.content()).contains("linear context"));
        verify(embeddingProvider).embed(List.of("hello"), new AiCredential("https://embedding.test", "secret"));
        verify(retrievalService).retrieve(userId, vector, 2);
    }

    @Test
    void rejectsTopKOutsideConfiguredRangeBeforeCreatingMessage() {
        UUID userId = UUID.randomUUID();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);

        assertThatThrownBy(() -> streamingService.stream(userId,
                new AiMessageCommand(null, "hello", AiProviderType.DEEPSEEK, false, 9, "request-topk")))
                .isInstanceOf(DomainException.class)
                .extracting("code")
                .isEqualTo("VALIDATION_FAILED");
        verifyNoInteractions(conversationService, settingsService, providerRegistry, retrievalService,
                embeddingProviderRegistry);
    }

    @Test
    void duplicateClientRequestReplaysPersistedAssistantWithoutCallingProvider() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);
        MessageView userMessage = new MessageView(UUID.randomUUID(), 1, AiMessageRole.USER,
                AiMessageStatus.COMPLETED, "hello", null, null, null);
        MessageView assistantMessage = new MessageView(UUID.randomUUID(), 2, AiMessageRole.ASSISTANT,
                AiMessageStatus.COMPLETED, "answer", "deepseek-chat", null, null);
        ConversationService.ClientRequestReplay replay = new ConversationService.ClientRequestReplay(
                conversationId, userMessage, assistantMessage);
        when(conversationService.reserveUserMessage(eq(userId), any(), anyString(), anyString(), eq("duplicate")))
                .thenReturn(new ConversationService.ClientRequestReservation(
                        conversationId, userMessage, assistantMessage, false));

        List<AiStreamEvent> events = streamingService.stream(userId,
                new AiMessageCommand(null, "retry", AiProviderType.DEEPSEEK, false, 3, "duplicate"));

        assertThat(events).extracting(AiStreamEvent::event)
                .containsExactly("message.started", "message.delta", "message.completed");
        assertThat(events.get(1).data()).isEqualTo("answer");
        verify(conversationService, never()).appendMessage(any(), any(), any(), any(), any(), any(), any());
        verifyNoInteractions(settingsService, providerRegistry, retrievalService, embeddingProviderRegistry);
    }

    @Test
    void clientDisconnectPersistsPartialAssistantAsInterrupted() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);
        when(settingsService.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-chat", new AiCredential("https://provider.test", "secret")));
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(new FakeStreamingProvider());

        streamingService.stream(userId,
                new AiMessageCommand(conversationId, "hello", AiProviderType.DEEPSEEK, false, 3, "request-abort"),
                event -> {
                    if (event.event().equals("message.delta")) {
                        throw new AiStreamAbortException("client disconnected");
                    }
                });

        verify(conversationService).appendAssistantReply(eq(userId), eq(conversationId), any(),
                eq("hello "), eq(AiMessageStatus.INTERRUPTED), eq("deepseek-chat"), eq("CLIENT_DISCONNECTED"));
    }

    @Test
    void rateLimitMarksAssistantFailedAndEmitsError() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.maxRetrievedChunks()).thenReturn(8);
        when(settingsService.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-chat", new AiCredential("https://provider.test", "secret")));
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(new AiProviderPort() {
            @Override
            public AiProviderType type() {
                return AiProviderType.DEEPSEEK;
            }

            @Override
            public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                throw new DomainException("RATE_LIMITED", "rate limited");
            }
        });

        List<AiStreamEvent> events = streamingService.stream(userId,
                new AiMessageCommand(conversationId, "hello", AiProviderType.DEEPSEEK, false, 3, "request-limit"));

        assertThat(events).extracting(AiStreamEvent::event)
                .containsExactly("message.started", "message.error");
        assertThat(events.get(1).data()).isInstanceOf(java.util.Map.class)
                .extracting(value -> ((java.util.Map<?, ?>) value).get("code"))
                .isEqualTo("RATE_LIMITED");
        verify(conversationService).appendAssistantReply(eq(userId), eq(conversationId), any(),
                eq(""), eq(AiMessageStatus.FAILED), eq("deepseek-chat"), eq("RATE_LIMITED"));
    }

    private static final class FakeStreamingProvider implements AiProviderPort {
        @Override
        public AiProviderType type() {
            return AiProviderType.DEEPSEEK;
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return new AiProviderResponse("hello world", 1, 2);
        }

        @Override
        public List<AiProviderChunk> stream(AiProviderRequest request, AiCredential credential) {
            return List.of(new AiProviderChunk("hello ", false), new AiProviderChunk("world", true));
        }
    }

    private static final class CapturingStreamingProvider implements AiProviderPort {
        private final AtomicReference<AiProviderRequest> request;

        private CapturingStreamingProvider(AtomicReference<AiProviderRequest> request) {
            this.request = request;
        }

        @Override
        public AiProviderType type() {
            return AiProviderType.DEEPSEEK;
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            this.request.set(request);
            return new AiProviderResponse("answer", 1, 1);
        }

        @Override
        public List<AiProviderChunk> stream(AiProviderRequest request, AiCredential credential) {
            this.request.set(request);
            return List.of(new AiProviderChunk("answer", true));
        }
    }
}
