package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.internal.chat.ChatAgentOrchestrator;
import com.auralis.app.ai.internal.chat.ChatRuntimePersistenceService;
import com.auralis.app.ai.internal.persistence.ChatActivityRepository;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockAsyncContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.context.request.async.WebAsyncUtils;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class, properties = {
        "auralis.ai.enabled=false",
        "auralis.ai.generation.base-url=https://example.invalid",
        "auralis.ai.generation.model=chat-dispatch-test",
        "auralis.ai.generation.api-key=test-only"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ChatMvcDispatchTests {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private IdentityService identity;
    @Autowired private ConversationService conversations;
    @Autowired private ChatAgentOrchestrator orchestrator;
    @Autowired private ChatRuntimePersistenceService persistence;
    @Autowired private ChatActivityRepository activities;

    @TestBean(name = "mvcAsyncTaskExecutor", methodName = "rejectingExecutor", enforceOverride = true)
    private AsyncTaskExecutor mvcAsyncTaskExecutor;

    private AuthResult auth;
    private UUID conversationId;

    static AsyncTaskExecutor rejectingExecutor() {
        return task -> { throw new TaskRejectedException("test MVC task rejection"); };
    }

    @BeforeEach
    void createConversation() {
        String id = UUID.randomUUID().toString();
        auth = identity.register("chat-dispatch-" + id + "@example.com", "correct horse battery staple",
                "Chat dispatch tests", new DeviceCommand(id, "Test", DevicePlatform.WEB));
        conversationId = conversations.create(auth.user().id(), new ConversationCommand("Chat", 0L)).id();
    }

    @Test
    void rejectsTurnAndRetryBeforeExecutionAndLeavesTheSameRunRetryable() throws Exception {
        UUID userId = auth.user().id();
        AiMessageCommand turn = turn("turn-1");
        assertBusy(turnRequest(turn));

        var first = persistence.findReplay(userId, turn);
        UUID runId = first.run().getId();
        assertSettledBeforeStart(first);
        mvc.perform(get("/api/ai/conversations/{conversationId}/runs/{runId}", conversationId, runId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.executionActive").value(false))
                .andExpect(jsonPath("$.attempts[0].safeErrorCode").value("CHAT_ATTEMPT_NOT_DISPATCHED"));

        assertBusy(post("/api/ai/conversations/{conversationId}/runs/{runId}/attempts", conversationId, runId)
                .content("{\"requestId\":\"retry-1\"}"));
        var rejectedRetry = persistence.findRetryReplay(userId, conversationId, runId, "retry-1");
        assertSettledBeforeStart(rejectedRetry);
        assertThat(rejectedRetry.userMessageId()).isEqualTo(first.userMessageId());
        assertThat(rejectedRetry.attempt().getAllocatedReplyMessageId())
                .isNotEqualTo(first.attempt().getAllocatedReplyMessageId());

        var next = orchestrator.admitRetry(userId, conversationId, runId, "retry-2");
        persistence.rejectDispatch(userId, conversationId, runId,
                rejectedRetry.attempt().getId(), rejectedRetry.attempt().getFenceVersion());
        assertThat(persistence.findReplay(userId, turn).attempt().getId()).isEqualTo(next.attempt().getId());
        assertThat(persistence.executionActive(userId, conversationId, runId)).isTrue();
    }

    @Test
    void rejectsReplayWithoutSettlingThePendingAttemptItReplayed() throws Exception {
        UUID userId = auth.user().id();
        AiMessageCommand turn = turn("turn-1");
        var admitted = orchestrator.admit(userId, turn);
        assertBusy(turnRequest(turn));

        var replay = persistence.findReplay(userId, turn);
        assertThat(replay.attempt().getId()).isEqualTo(admitted.attempt().getId());
        assertThat(replay.attempt().getStatus()).isEqualTo("PENDING");
        assertThat(persistence.executionActive(userId, conversationId, admitted.run().getId())).isTrue();
    }

    @Test
    void preservesSubmittedAnswerWhenItsFeedbackStreamIsRejected() throws Exception {
        UUID userId = auth.user().id();
        UUID activityId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        UUID submissionId = UUID.randomUUID();
        var source = orchestrator.admit(userId, turn("activity-source"));
        UUID sourceRunId = source.run().getId();
        UUID sourceAttemptId = source.attempt().getId();
        long fence = source.attempt().getFenceVersion();
        assertThat(persistence.claim(userId, conversationId, sourceRunId, sourceAttemptId, fence))
                .isEqualTo(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        persistence.readyActivity(userId, conversationId, sourceRunId, sourceAttemptId, fence, Map.of(),
                activityId, blockId, 1, "open", "{}", "{}", "[]", "[]", "[]", "What did you learn?", "test", 1);
        persistence.finish(userId, conversationId, sourceRunId, sourceAttemptId, fence, Map.of(),
                "COMPLETED", "[]", "[]", 2, "What did you learn?", "test", null);

        AiMessageCommand submission = new AiMessageCommand(1, "activity_submission", conversationId,
                "activity-submit", null, null, null, activityId, 1, submissionId, mapper.valueToTree("My answer"));
        assertBusy(post("/api/ai/messages/stream").content(mapper.writeValueAsString(submission)));

        var feedback = persistence.findReplay(userId, submission);
        assertSettledBeforeStart(feedback);
        var activity = activities.findByIdAndUserId(activityId, userId).orElseThrow();
        assertThat(activity.getState()).isEqualTo("SUBMITTED");
        assertThat(activity.getSubmissionId()).isEqualTo(submissionId);
        assertThat(activity.getReplyRunId()).isEqualTo(feedback.run().getId());
        assertThat(mapper.readTree(activity.getAnswerJson()).stringValue()).isEqualTo("My answer");
    }

    private AiMessageCommand turn(String requestId) {
        return new AiMessageCommand(1, "turn", conversationId, requestId, "Explain this",
                null, null, null, null, null, null);
    }

    private MockHttpServletRequestBuilder turnRequest(AiMessageCommand turn) {
        return post("/api/ai/messages/stream").content(mapper.writeValueAsString(Map.of(
                "protocolVersion", turn.protocolVersion(), "action", turn.action(),
                "conversationId", turn.conversationId(), "requestId", turn.requestId(), "content", turn.content())));
    }

    private void assertBusy(MockHttpServletRequestBuilder request) throws Exception {
        var pending = mvc.perform(request
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                .accept(MediaType.TEXT_EVENT_STREAM)
                .contentType(MediaType.APPLICATION_JSON)).andReturn();
        var asyncRequest = pending.getRequest();
        assertThat(WebAsyncUtils.getAsyncManager(asyncRequest).getConcurrentResult())
                .isInstanceOf(TaskRejectedException.class);
        assertThat(((MockAsyncContext) asyncRequest.getAsyncContext()).getDispatchedPath())
                .isEqualTo(asyncRequest.getRequestURI());
        // MockMvc's asyncDispatch waits for a callable interceptor that never runs on submission rejection.
        asyncRequest.setDispatcherType(DispatcherType.ASYNC);
        asyncRequest.setAsyncStarted(false);
        mvc.perform(servletContext -> asyncRequest)
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "1"))
                .andExpect(jsonPath("$.code").value("SERVICE_UNAVAILABLE"));
    }

    private void assertSettledBeforeStart(ChatRuntimePersistenceService.Admission replay) {
        assertThat(replay.run().getStatus()).isEqualTo("FAILED");
        assertThat(replay.attempt().getStatus()).isEqualTo("FAILED");
        assertThat(replay.attempt().getSafeErrorCode()).isEqualTo("CHAT_ATTEMPT_NOT_DISPATCHED");
        assertThat(replay.attempt().getStartedAt()).isNull();
        assertThat(replay.attempt().getReplyMessageId()).isEqualTo(replay.attempt().getAllocatedReplyMessageId());
        assertThat(conversations.get(auth.user().id(), conversationId).activeRun()).isNull();
    }
}
