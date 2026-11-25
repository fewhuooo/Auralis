package com.auralis.app;

import com.auralis.app.ai.ConversationCommand;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.ChatConversationScope;
import com.auralis.app.ai.ChatConversationScopeState;
import com.auralis.app.ai.internal.persistence.ChatAttemptRepository;
import com.auralis.app.ai.internal.persistence.ChatRunRepository;
import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiConversationServiceTests {

    @Mock
    private ConversationRepository conversationRepository;

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private ChatAttemptRepository chatAttemptRepository;

    @Mock
    private ChatRunRepository chatRunRepository;

    @Spy
    private ObjectMapper objectMapper = JsonMapper.builder().build();

    @InjectMocks
    private ConversationService conversationService;

    @Test
    void createsAndListsOnlyTheCurrentUsersConversations() {
        UUID userId = UUID.randomUUID();
        when(conversationRepository.saveAndFlush(any(ConversationEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(conversationRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId))
                .thenReturn(List.of());

        ConversationView created = conversationService.create(userId, new ConversationCommand("Study", 0L));

        assertThat(created.title()).isEqualTo("Study");
        assertThat(conversationService.list(userId)).isEmpty();
        verify(conversationRepository).findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId);
    }

    @Test
    void createsCurrentConversationWithUnboundScope() {
        UUID userId = UUID.randomUUID();
        when(conversationRepository.saveAndFlush(any(ConversationEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ConversationView view = conversationService.create(userId,
                new ConversationCommand("Chapter 1", 0L, null));

        assertThat(view.chatScopeState()).isEqualTo(ChatConversationScopeState.UNBOUND);
        assertThat(view.chatScope()).isNull();
        assertThat(view.chatProtocolVersion()).isEqualTo((short) 1);
        assertThat(view.chatSupported()).isTrue();
    }

    @Test
    void conversationDetailRestoresBoundScopeWithoutSelectionText() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        ChatConversationScope scope = new ChatConversationScope(null, subjectId,
                com.auralis.app.ai.retrieval.ReadingContext.RetrievalMode.SUBJECT, List.of());
        ConversationEntity entity = new ConversationEntity(conversationId, userId, "Scoped chat");
        entity.enableChatProtocolOne();
        entity.bindChatScope("{\"currentSourceId\":null,\"subjectId\":\"" + subjectId
                + "\",\"retrievalMode\":\"SUBJECT\",\"sourceIds\":[]}");
        when(conversationRepository.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId))
                .thenReturn(Optional.of(entity));
        when(messageRepository.findAllByConversationIdAndUserIdOrderByMessageSequenceAsc(conversationId, userId))
                .thenReturn(List.of());

        ConversationView view = conversationService.get(userId, conversationId);

        assertThat(view.chatScopeState()).isEqualTo(ChatConversationScopeState.BOUND);
        assertThat(view.chatScope()).isEqualTo(scope);
    }

}
