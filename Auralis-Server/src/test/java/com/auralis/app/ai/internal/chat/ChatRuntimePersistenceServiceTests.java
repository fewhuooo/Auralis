package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.ConversationPurpose;
import com.auralis.app.ai.internal.persistence.ChatActivityEntity;
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
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatRuntimePersistenceServiceTests {
    @Mock private ConversationRepository conversations;
    @Mock private MessageRepository messages;
    @Mock private ChatRunRepository runs;
    @Mock private ChatAttemptRepository attempts;
    @Mock private ChatActivityRepository activities;
    @Mock private SourceService sources;

    private ChatRuntimePersistenceService persistence;
    private UUID userId;
    private UUID conversationId;
    private UUID runId;
    private UUID attemptId;
    private UUID replyId;
    private UUID sourceId;
    private long fence;
    private ConversationEntity conversation;
    private ChatRunEntity run;
    private ChatAttemptEntity attempt;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        conversationId = UUID.randomUUID();
        runId = UUID.randomUUID();
        attemptId = UUID.randomUUID();
        replyId = UUID.randomUUID();
        sourceId = UUID.randomUUID();
        conversation = new ConversationEntity(conversationId, userId, "Chat", null,
                ConversationPurpose.GENERAL, null);
        conversation.enableChatProtocolOne();
        conversation.markChatScopeUnbound();
        conversation.bindChatScope(null);
        fence = conversation.reserveChatRun(runId);
        UUID userMessageId = UUID.randomUUID();
        run = new ChatRunEntity(runId, userId, conversationId, "request-1", "request-hash",
                "{}", "turn", userMessageId, UUID.randomUUID(), fence);
        run.pointToAttempt(attemptId, replyId);
        run.mark("RUNNING");
        attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "request-hash", 1,
                "worker-a", fence, replyId, "[]", "[]", Instant.now().plusSeconds(300));
        attempt.markRunning();
        persistence = new ChatRuntimePersistenceService(conversations, messages, runs, attempts,
                activities, sources, JsonMapper.builder().build(), ChatAgentProperties.defaults(), "worker-b");

        lenient().when(conversations.findForUpdateByIdAndUserIdAndDeletedAtIsNull(conversationId, userId))
                .thenReturn(Optional.of(conversation));
        lenient().when(runs.findForUpdate(runId, userId, conversationId)).thenReturn(Optional.of(run));
        lenient().when(attempts.findForUpdate(attemptId, runId, userId)).thenReturn(Optional.of(attempt));
        lenient().when(conversations.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(runs.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(attempts.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(messages.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(activities.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void readyActivityPersistsBusinessCompletionButKeepsWorkerSlotUntilFinish() {
        when(messages.existsById(replyId)).thenReturn(false, true);
        UUID activityId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();

        ChatActivityEntity activity = persistence.readyActivity(userId, conversationId, runId, attemptId,
                fence, Map.of(), activityId, blockId, 1, "open", "{}", "{}", "[]", "[]", "[]", "question", "model", 4);

        assertThat(activity.getState()).isEqualTo("READY");
        assertThat(run.getStatus()).isEqualTo("COMPLETED");
        assertThat(attempt.getReplyMessageId()).isEqualTo(replyId);
        assertThat(conversation.getActiveChatRunId()).isEqualTo(runId);

        ChatRuntimePersistenceService.Terminal terminal = persistence.finish(userId, conversationId, runId,
                attemptId, fence, Map.of(), "COMPLETED", "[]", "[]", 5, "question", "model", null);

        assertThat(terminal.run().getStatus()).isEqualTo("COMPLETED");
        assertThat(attempt.getStatus()).isEqualTo("COMPLETED");
        assertThat(conversation.getActiveChatRunId()).isNull();
    }

    @Test
    void unknownFinishAfterReadyActivityUsesBusinessCompletionToReleaseSlot() {
        when(messages.existsById(replyId)).thenReturn(false, true);
        persistence.readyActivity(userId, conversationId, runId, attemptId, fence, Map.of(), UUID.randomUUID(),
                UUID.randomUUID(), 1, "open", "{}", "{}", "[]", "[]", "[]", "question", "model", 4);

        ChatRuntimePersistenceService.Terminal terminal = persistence.finish(userId, conversationId, runId,
                attemptId, fence, Map.of(), "UNKNOWN", "[]", "[]", 5, "", "model",
                "CHAT_WORKER_OWNERSHIP_UNKNOWN");

        assertThat(terminal.run().getStatus()).isEqualTo("COMPLETED");
        assertThat(terminal.attempt().getStatus()).isEqualTo("COMPLETED");
        assertThat(terminal.attempt().getSafeErrorCode()).isNull();
        assertThat(conversation.getActiveChatRunId()).isNull();
    }

    @Test
    void readyActivityRejectsCancelCommittedBeforeItsAtomicTransaction() {
        persistence.requestCancel(userId, conversationId, runId);

        assertThatThrownBy(() -> persistence.readyActivity(userId, conversationId, runId, attemptId,
                fence, Map.of(), UUID.randomUUID(), UUID.randomUUID(), 1, "open", "{}", null,
                "[]", "[]", "[]", "question", "model", 4))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("CHAT_RUN_CANCELLED"));

        assertThat(attempt.getStatus()).isEqualTo("CANCEL_REQUESTED");
        assertThat(run.getStatus()).isEqualTo("RUNNING");
        verify(attempts, times(1)).saveAndFlush(attempt);
        verify(activities, never()).saveAndFlush(any());
        verify(messages, never()).saveAndFlush(any());
    }

    @Test
    void localDisplayCheckpointRejectsCancelCommittedBeforeItsAtomicTransaction() {
        persistence.requestCancel(userId, conversationId, runId);

        assertThatThrownBy(() -> persistence.checkpointLocalToolEvidence(userId, conversationId, runId,
                attemptId, fence, Map.of(), "[]", "[]", 3, "[]"))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("CHAT_RUN_CANCELLED"));

        assertThat(attempt.getStatus()).isEqualTo("CANCEL_REQUESTED");
        verify(attempts, times(1)).saveAndFlush(attempt);
    }

    @Test
    void localDisplayCheckpointChecksExistingSourceRevisionFence() {
        when(sources.lockAndCheckReadyRevisions(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.anyMap())).thenReturn(false);

        assertThatThrownBy(() -> persistence.checkpointLocalToolEvidence(userId, conversationId, runId,
                attemptId, fence, Map.of(sourceId, UUID.randomUUID()), "[]", "[]", 3, "[]"))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("SOURCE_SCOPE_CHANGED"));

        verify(attempts, never()).saveAndFlush(any());
    }

    @Test
    void publicationOwnerCheckRejectsFencedAttemptBeforeAnyChunkIsPublished() {
        when(conversations.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId))
                .thenReturn(Optional.of(conversation));
        when(runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)).thenReturn(Optional.of(run));
        when(attempts.findByIdAndRunIdAndUserId(attemptId, runId, userId)).thenReturn(Optional.of(attempt));

        conversation.fenceUnknownChatRun(runId);

        assertThatThrownBy(() -> persistence.validatePublicationOwner(
                userId, conversationId, runId, attemptId, fence))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("no longer owns");
    }

    @Test
    void sourceOwnershipOrRevisionLossPersistsFailedMessageAndReleasesOwnedSlot() {
        when(messages.existsById(replyId)).thenReturn(false);
        when(sources.lockAndCheckReadyRevisions(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.anyMap())).thenReturn(false);

        ChatRuntimePersistenceService.Terminal terminal = persistence.finish(userId, conversationId, runId,
                attemptId, fence, Map.of(sourceId, UUID.randomUUID()), "COMPLETED", "[]", "[]", 2,
                "partial response", "model", null);

        assertThat(terminal.run().getStatus()).isEqualTo("FAILED");
        assertThat(terminal.attempt().getStatus()).isEqualTo("FAILED");
        assertThat(terminal.attempt().getSafeErrorCode()).isEqualTo("SOURCE_SCOPE_CHANGED");
        assertThat(terminal.replyMessageId()).isEqualTo(replyId);
        assertThat(conversation.getActiveChatRunId()).isNull();
    }

    @Test
    void retryAdvancesRunConversationAndAttemptFenceAndCanClaimAndSettle() {
        conversation.releaseChatRun(runId, fence);
        run.mark("FAILED");
        attempt.completeMessage(replyId, "FAILED", "CHAT_RUN_FAILED");
        when(attempts.findTopByRunIdOrderByAttemptNoDesc(runId)).thenReturn(Optional.of(attempt));
        when(attempts.findByUserIdAndRequestId(userId, "request-2")).thenReturn(Optional.empty());

        ChatRuntimePersistenceService.Admission retried = persistence.retry(userId, conversationId, runId, "request-2");
        long retryFence = retried.attempt().getFenceVersion();
        when(attempts.findForUpdate(retried.attempt().getId(), runId, userId)).thenReturn(Optional.of(retried.attempt()));

        assertThat(retryFence).isEqualTo(conversation.getChatFence());
        assertThat(retried.run().getFenceVersion()).isEqualTo(retryFence);
        assertThat(retried.attempt().getAttemptNo()).isEqualTo(2);
        assertThat(persistence.claim(userId, conversationId, runId, retried.attempt().getId(), retryFence))
                .isEqualTo(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        assertThat(retried.run().getStatus()).isEqualTo("RUNNING");

        ChatRuntimePersistenceService.Terminal terminal = persistence.finish(userId, conversationId, runId,
                retried.attempt().getId(), retryFence, Map.of(), "COMPLETED", "[]", "[]", 1,
                "retry reply", "model", null);

        assertThat(terminal.run().getStatus()).isEqualTo("COMPLETED");
        assertThat(terminal.attempt().getStatus()).isEqualTo("COMPLETED");
        assertThat(conversation.getActiveChatRunId()).isNull();
    }

    @Test
    void fencedCheckpointPersistsPrivateToolEvidenceWithoutChangingPublicSnapshots() {
        persistence.checkpoint(userId, conversationId, runId, attemptId, fence, Map.of(),
                "[{\"kind\":\"text\",\"text\":\"public\"}]", "[]", 4,
                "[{\"toolName\":\"read_source\",\"resultJson\":\"private evidence\"}]");

        assertThat(attempt.getPrivateToolEvidenceJson()).contains("private evidence", "read_source");
        assertThat(attempt.getPublicPartsJson()).contains("public").doesNotContain("private evidence");
        assertThat(attempt.getToolTraceJson()).doesNotContain("private evidence");
    }
}
