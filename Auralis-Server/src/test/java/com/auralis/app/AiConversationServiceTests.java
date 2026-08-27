package com.auralis.app;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.ConversationCommand;
import com.auralis.app.ai.ConversationPurpose;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.ReadingConversationCleanupService;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
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
    void allocatesMessageSequencesFromTheConversationCounterAndRejectsBlankContent() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        when(conversationRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(conversationId, userId))
                .thenReturn(Optional.of(new ConversationEntity(conversationId, userId, "Study")));
        when(messageRepository.saveAndFlush(any(MessageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MessageView message = conversationService.appendMessage(
                userId, conversationId, AiMessageRole.USER, "hello", AiMessageStatus.COMPLETED, null, null);

        assertThat(message.messageSequence()).isEqualTo(1L);
        assertThatThrownBy(() -> conversationService.appendMessage(
                userId, conversationId, AiMessageRole.USER, " ", AiMessageStatus.COMPLETED, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void createsReadingSessionWithSourceBindingAndRejectsInvalidScope() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(conversationRepository.saveAndFlush(any(ConversationEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ConversationView view = conversationService.create(userId,
                new ConversationCommand("Chapter 1", 0L, null, ConversationPurpose.READING_SESSION, sourceId));

        assertThat(view.purpose()).isEqualTo(ConversationPurpose.READING_SESSION);
        assertThat(view.sourceId()).isEqualTo(sourceId);
        assertThatThrownBy(() -> conversationService.create(userId,
                new ConversationCommand("Missing source", 0L, null, ConversationPurpose.READING_SESSION, null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("sourceId");
        assertThatThrownBy(() -> conversationService.create(userId,
                new ConversationCommand("General", 0L, null, ConversationPurpose.GENERAL, sourceId)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class);
    }

    @Test
    void cleanupSoftDeletesOnlyInactiveReadingSessions() {
        ConversationEntity session = new ConversationEntity(
                UUID.randomUUID(), UUID.randomUUID(), "Old", null, ConversationPurpose.READING_SESSION,
                UUID.randomUUID());
        when(conversationRepository.findAllByPurposeAndDeletedAtIsNullAndUpdatedAtBefore(
                any(ConversationPurpose.class), any()))
                .thenReturn(List.of(session));

        ReadingConversationCleanupService cleanup = new ReadingConversationCleanupService(conversationRepository);
        int count = cleanup.cleanupInactive(java.time.Instant.parse("2026-08-26T00:00:00Z"));

        assertThat(count).isEqualTo(1);
        assertThat(session.getDeletedAt()).isNotNull();
        verify(conversationRepository).saveAllAndFlush(List.of(session));
    }
}
