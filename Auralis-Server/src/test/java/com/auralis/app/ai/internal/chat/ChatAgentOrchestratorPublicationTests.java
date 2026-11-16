package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import dev.langchain4j.model.chat.response.PartialResponse;
import dev.langchain4j.model.chat.response.PartialResponseContext;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.chat.request.ChatRequest;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatAgentOrchestratorPublicationTests {
    private static final String CONTENT = "must-not-be-published";

    @Test
    void sourceRevisionChangeBeforePartialChunkKeepsThatChunkOutOfSse() throws Exception {
        assertChunkIsNotPublished(true, false);
    }

    @Test
    void ownerFenceChangeBeforePartialChunkKeepsThatChunkOutOfSse() throws Exception {
        assertChunkIsNotPublished(false, false);
    }

    @Test
    void projectorNoFitFailsBeforeProviderReservation() throws Exception {
        assertChunkIsNotPublished(false, true);
    }

    private void assertChunkIsNotPublished(boolean sourceRevisionChanges, boolean forceCapacityNoFit) throws Exception {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID userMessageId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        long fence = 3L;

        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String requestContext = "{\"readingContext\":{\"currentSourceId\":\"" + sourceId
                + "\",\"subjectId\":\"" + UUID.randomUUID()
                + "\",\"retrievalMode\":\"AUTO\",\"sourceIds\":[\"" + sourceId
                + "\"]},\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity run = new ChatRunEntity(runId, userId, conversationId, "request-1", "request-hash",
                requestContext, "turn", userMessageId, runId, fence);
        run.pointToAttempt(attemptId, replyId);
        ChatAttemptEntity attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "request-hash",
                1, "worker-a", fence, replyId, "[]", "[]", Instant.now().plusSeconds(30));
        MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 1,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Question", null, null, null);

        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        ChatAgentModelAdapter adapter = mock(ChatAgentModelAdapter.class);
        AuralisProperties runtimeProperties = mock(AuralisProperties.class);
        AuralisProperties.Ai runtimeAiProperties = mock(AuralisProperties.Ai.class);
        when(runtimeProperties.ai()).thenReturn(runtimeAiProperties);
        when(runtimeAiProperties.maxPromptChars()).thenReturn(forceCapacityNoFit ? 1 : 50_000);
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);

        when(persistence.claim(userId, conversationId, runId, attemptId, fence))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(userId, conversationId, runId))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK,
                        "test-model", endpointHash));
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(fence), anyMap(),
                eq("FAILED"), any(), any(), anyLong(), any(), anyString(), any()))
                .thenReturn(new ChatRuntimePersistenceService.Terminal(run, attempt, replyId));
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        when(readScope.revisionSnapshot()).thenReturn(Map.of(sourceId, revision));
        if (sourceRevisionChanges) {
            doNothing().doThrow(new DomainException("SOURCE_SCOPE_CHANGED", "Source changed during this Chat run"))
                    .when(readScope).validateCurrent();
        } else {
            doNothing().when(readScope).validateCurrent();
            doThrow(new DomainException("CHAT_WORKER_OWNERSHIP_LOST", "Chat worker no longer owns this attempt"))
                    .when(persistence).validatePublicationOwner(userId, conversationId, runId, attemptId, fence);
        }
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(adapterFactory.create(any(), eq(taskScope), any())).thenReturn(adapter);
        AiChatRequestMapper requestMapper = new AiChatRequestMapper(new ObjectMapper());
        when(adapter.mapRequest(any(ChatRequest.class), anyMap())).thenAnswer(invocation ->
                requestMapper.toProviderRequest(invocation.getArgument(0), "test-model", 256,
                        invocation.getArgument(1)));
        when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                List.<MessageView>of(), Instant.now(), Instant.now(), null, 0L, (short) 1, true, null, com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
        when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));
        doAnswer(invocation -> {
            StreamingChatResponseHandler handler = invocation.getArgument(1);
            handler.onPartialResponse(new PartialResponse(CONTENT), mock(PartialResponseContext.class));
            return null;
        }).when(adapter).chatWithRawCapture(any(ChatRequest.class), any(StreamingChatResponseHandler.class),
                any(java.util.function.Consumer.class), any(java.util.function.Consumer.class));

        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, ChatAgentProperties.defaults(), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), runtimeProperties);
        List<com.auralis.app.ai.ChatSseEnvelope> emitted = new ArrayList<>();
        orchestrator.executeAdmission(userId,
                new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false),
                "request-1", null, emitted::add);

        assertThat(emitted).extracting(com.auralis.app.ai.ChatSseEnvelope::event)
                .doesNotContain("text.delta", "block.started", "block.item", "block.completed", "block.error");
        assertThat(emitted).anySatisfy(event -> assertThat(event.event()).isEqualTo("run.failed"));
        if (forceCapacityNoFit) {
            verify(persistence).finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(fence), anyMap(),
                    eq("FAILED"), any(), any(), anyLong(), any(), anyString(), eq("AI_REQUEST_BUDGET_EXCEEDED"));
            verify(adapter, never()).chatWithRawCapture(any(ChatRequest.class), any(), any(), any());
            verify(taskScope, never()).stream(any(), any(), any(), any(), any(), any(), any());
        }
        verify(persistence).finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(fence), anyMap(),
                eq("FAILED"), any(), any(), anyLong(), any(), anyString(), any());
        if (sourceRevisionChanges) {
            verify(persistence, org.mockito.Mockito.never())
                    .validatePublicationOwner(userId, conversationId, runId, attemptId, fence);
        }
    }
}
