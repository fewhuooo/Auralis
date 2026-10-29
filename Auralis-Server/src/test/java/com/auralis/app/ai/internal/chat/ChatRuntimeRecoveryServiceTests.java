package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.ConversationPurpose;
import com.auralis.app.ai.internal.persistence.ChatActivityRepository;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatAttemptRepository;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.ChatRunRepository;
import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.source.SourceService;
import com.auralis.app.ai.usage.ChatAgentProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;

@ExtendWith(MockitoExtension.class)
class ChatRuntimeRecoveryServiceTests {
    @Mock private ConversationRepository conversations;
    @Mock private MessageRepository messages;
    @Mock private ChatRunRepository runs;
    @Mock private ChatAttemptRepository attempts;
    @Mock private ChatActivityRepository activities;
    @Mock private SourceService sources;

    private UUID userId;
    private UUID conversationId;
    private UUID runId;
    private UUID attemptId;
    private ConversationEntity conversation;
    private ChatRunEntity run;
    private ChatAttemptEntity attempt;
    private ChatRuntimePersistenceService persistence;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        conversationId = UUID.randomUUID();
        runId = UUID.randomUUID();
        attemptId = UUID.randomUUID();
        conversation = new ConversationEntity(conversationId, userId, "Chat", null,
                ConversationPurpose.GENERAL, null);
        conversation.enableChatProtocolOne();
        long fence = conversation.reserveChatRun(runId);
        run = new ChatRunEntity(runId, userId, conversationId, "request-1", "hash",
                "{}", "turn", UUID.randomUUID(), UUID.randomUUID(), fence);
        attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "hash", 1,
                "node-a", fence, UUID.randomUUID(), "[]", "[]", Instant.now().plusSeconds(300));
        run.pointToAttempt(attemptId, attempt.getAllocatedReplyMessageId());
        run.mark("RUNNING");
        attempt.markRunning();
        persistence = new ChatRuntimePersistenceService(conversations, messages, runs, attempts, activities,
                sources, JsonMapper.builder().build(), ChatAgentProperties.defaults(), "node-b");

        lenient().when(conversations.findForUpdateByIdAndUserIdAndDeletedAtIsNull(conversationId, userId))
                .thenReturn(Optional.of(conversation));
        lenient().when(runs.findForUpdate(runId, userId, conversationId)).thenReturn(Optional.of(run));
        lenient().when(attempts.findForUpdate(attemptId, runId, userId)).thenReturn(Optional.of(attempt));
        lenient().when(attempts.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(runs.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(conversations.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void freshForeignWorkerRemainsRunningAndKeepsItsFence() {
        persistence.recoverAfterRestart(userId, conversationId, runId, attemptId);

        assertThat(attempt.getStatus()).isEqualTo("RUNNING");
        assertThat(run.getStatus()).isEqualTo("RUNNING");
        assertThat(conversation.getActiveChatRunId()).isEqualTo(runId);
        assertThat(conversation.getChatFence()).isEqualTo(1);
        verify(attempts, never()).saveAndFlush(any());
        verify(runs, never()).saveAndFlush(any());
        verify(conversations, never()).saveAndFlush(any());
    }

    @Test
    void expiredForeignWorkerIsFencedAndHeldAsUnknown() {
        attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "hash", 1,
                "node-a", conversation.getChatFence(), UUID.randomUUID(), "[]", "[]", Instant.now().minusSeconds(1));
        attempt.markRunning();
        doReturn(Optional.of(attempt)).when(attempts).findForUpdate(attemptId, runId, userId);

        persistence.recoverAfterRestart(userId, conversationId, runId, attemptId);

        assertThat(attempt.getStatus()).isEqualTo("UNKNOWN");
        assertThat(attempt.getSafeErrorCode()).isEqualTo("CHAT_WORKER_OWNERSHIP_UNKNOWN");
        assertThat(run.getStatus()).isEqualTo("UNKNOWN");
        assertThat(conversation.getActiveChatRunId()).isEqualTo(runId);
        assertThat(conversation.getChatFence()).isEqualTo(2);
        assertThat(attempt.getReplyMessageId()).isEqualTo(attempt.getAllocatedReplyMessageId());
        ArgumentCaptor<MessageEntity> reply = ArgumentCaptor.forClass(MessageEntity.class);
        verify(messages).saveAndFlush(reply.capture());
        assertThat(reply.getValue().getStatus()).isEqualTo(com.auralis.app.ai.AiMessageStatus.FAILED);
        assertThat(reply.getValue().getErrorCode()).isEqualTo("CHAT_WORKER_OWNERSHIP_UNKNOWN");
        verify(attempts).saveAndFlush(attempt);
        verify(runs).saveAndFlush(run);
        verify(conversations).saveAndFlush(conversation);
    }

    @Test
    void expiredPendingAttemptIsFailedWithoutRedispatchAndReleasesSlot() {
        attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "hash", 1,
                "node-a", conversation.getChatFence(), UUID.randomUUID(), "[]", "[]", Instant.now().minusSeconds(1));
        run.mark("PENDING");
        doReturn(Optional.of(attempt)).when(attempts).findForUpdate(attemptId, runId, userId);
        when(messages.existsById(attempt.getAllocatedReplyMessageId())).thenReturn(false);

        persistence.recoverAfterRestart(userId, conversationId, runId, attemptId);

        assertThat(attempt.getStatus()).isEqualTo("FAILED");
        assertThat(attempt.getSafeErrorCode()).isEqualTo("CHAT_ATTEMPT_NOT_DISPATCHED");
        assertThat(run.getStatus()).isEqualTo("FAILED");
        assertThat(conversation.getActiveChatRunId()).isNull();
        assertThat(conversation.getChatFence()).isEqualTo(2);
        verify(messages).saveAndFlush(any());
        verify(attempts).saveAndFlush(attempt);
        verify(runs).saveAndFlush(run);
        verify(conversations).saveAndFlush(conversation);
    }

    @Test
    void executionProfileReadsOnlyProviderModelAndEndpointHashFromPersistedContext() {
        ChatRunEntity profiledRun = new ChatRunEntity(runId, userId, conversationId, "request-1", "hash",
                "{\"executionProfile\":{\"provider\":\"SILICONFLOW\",\"chatModel\":\"model-a\","
                        + "\"endpointHash\":\"0123456789abcdef\"}}",
                "turn", UUID.randomUUID(), UUID.randomUUID(), 1L);
        when(runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId))
                .thenReturn(Optional.of(profiledRun));

        ChatRuntimePersistenceService.ExecutionProfile profile = persistence.executionProfile(
                userId, conversationId, runId);

        assertThat(profile.provider()).isEqualTo(com.auralis.app.ai.AiProviderType.SILICONFLOW);
        assertThat(profile.chatModel()).isEqualTo("model-a");
        assertThat(profile.endpointHash()).isEqualTo("0123456789abcdef");
        assertThat(profiledRun.getRequestContextJson()).doesNotContain("apiKey", "credential", "secret");
    }

    @Test
    void scheduledReconciliationQueriesOnlyBoundedExpiredForeignAttempts() throws Exception {
        ChatRuntimeRecoveryService service = new ChatRuntimeRecoveryService(attempts, runs, persistence);

        service.reconcileExpiredAttempts();

        verify(attempts).findExpiredForeignAttempts(
                org.mockito.ArgumentMatchers.eq(java.util.List.of("PENDING", "RUNNING", "CANCEL_REQUESTED")),
                org.mockito.ArgumentMatchers.any(Instant.class),
                org.mockito.ArgumentMatchers.eq(persistence.workerInstanceId()),
                org.mockito.ArgumentMatchers.eq(PageRequest.of(0, 100)));
        Scheduled scheduled = ChatRuntimeRecoveryService.class.getMethod("reconcileExpiredAttempts")
                .getAnnotation(Scheduled.class);
        assertThat(scheduled.fixedDelay()).isEqualTo(5000L);
    }

    @Test
    void requestHashUsesNormalizedClientBodyWithoutRequestId() {
        var first = new com.auralis.app.ai.AiMessageCommand(1, "turn", conversationId, "request-a",
                "  Explain this  ", null, "  selected passage  ", null, null, null, null);
        var replay = new com.auralis.app.ai.AiMessageCommand(1, "turn", conversationId, "request-b",
                "Explain this", null, "selected passage", null, null, null, null);
        var changedBody = new com.auralis.app.ai.AiMessageCommand(1, "turn", conversationId, "request-a",
                "Explain another thing", null, "selected passage", null, null, null, null);

        assertThat(persistence.requestHash(first)).isEqualTo(persistence.requestHash(replay));
        assertThat(persistence.requestHash(first)).isNotEqualTo(persistence.requestHash(changedBody));
    }
}
