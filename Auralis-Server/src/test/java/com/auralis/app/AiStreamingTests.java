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
import com.auralis.app.ai.AiStreamingService;
import com.auralis.app.ai.AiStreamEvent;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiStreamingTests {

    @Mock
    private ConversationService conversationService;

    @Mock
    private AiSettingsService settingsService;

    @Mock
    private AiProviderRegistry providerRegistry;

    @InjectMocks
    private AiStreamingService streamingService;

    @Test
    void emitsOrderedEventsAndPersistsCompletedAssistantMessage() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID userMessageId = UUID.randomUUID();
        AiProviderPort provider = new FakeStreamingProvider();
        when(conversationService.get(userId, conversationId)).thenReturn(new ConversationView(
                conversationId, "Study", List.of(), null, null, null));
        when(conversationService.appendMessage(eq(userId), eq(conversationId), eq(AiMessageRole.USER),
                eq("hello"), eq(AiMessageStatus.COMPLETED), eq(null), eq(null)))
                .thenReturn(new MessageView(userMessageId, 1, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                        "hello", null, null, null));
        when(conversationService.appendMessage(eq(userId), eq(conversationId), eq(AiMessageRole.ASSISTANT),
                eq("hello world"), eq(AiMessageStatus.COMPLETED), eq("deepseek-chat"), eq(null)))
                .thenReturn(new MessageView(UUID.randomUUID(), 2, AiMessageRole.ASSISTANT, AiMessageStatus.COMPLETED,
                        "hello world", "deepseek-chat", null, null));
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
        verify(conversationService).appendMessage(eq(userId), eq(conversationId), eq(AiMessageRole.ASSISTANT),
                eq("hello world"), eq(AiMessageStatus.COMPLETED), eq("deepseek-chat"), eq(null));
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
}
