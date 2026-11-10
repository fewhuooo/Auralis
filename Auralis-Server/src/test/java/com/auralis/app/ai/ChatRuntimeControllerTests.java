package com.auralis.app.ai;

import com.auralis.app.ai.internal.chat.ChatAgentOrchestrator;
import com.auralis.app.ai.internal.chat.ChatRuntimePersistenceService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.security.AuthenticatedUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.async.StandardServletAsyncWebRequest;
import org.springframework.web.context.request.async.WebAsyncUtils;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;

@ExtendWith(MockitoExtension.class)
class ChatRuntimeControllerTests {
    @Mock private ChatAgentOrchestrator orchestrator;
    @Mock private TextGenerationService textGeneration;

    private ChatRuntimeController controller;
    private UUID userId;
    private AuthenticatedUser principal;
    private AiMessageCommand command;

    @BeforeEach
    void setUp() {
        controller = new ChatRuntimeController(orchestrator, textGeneration, JsonMapper.builder().build());
        userId = UUID.randomUUID();
        principal = new AuthenticatedUser(userId, UUID.randomUUID(), UUID.randomUUID());
        command = new AiMessageCommand(1, "turn", UUID.randomUUID(), "request-1", "Explain this",
                null, null, null, null, null, null);
    }

    @Test
    void admissionFailureIsRaisedBeforeAnSseResponseIsReturned() {
        DomainException busy = new DomainException("CHAT_RUN_ACTIVE", "A run is already active");
        when(orchestrator.admit(userId, command)).thenThrow(busy);

        assertThatThrownBy(() -> controller.streamMessage(principal, command, new MockHttpServletRequest()))
                .isSameAs(busy);

        verify(orchestrator).admit(userId, command);
        verify(orchestrator, never()).executeAdmission(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void successfulAdmissionReturnsSseHeadersAndDefersExecutionToBody() throws Exception {
        var admission = new ChatRuntimePersistenceService.Admission(null, null, null, false);
        when(orchestrator.admit(userId, command)).thenReturn(admission);

        MockHttpServletRequest request = new MockHttpServletRequest();
        WebAsyncUtils.getAsyncManager(request).setAsyncWebRequest(
                new StandardServletAsyncWebRequest(request, new MockHttpServletResponse()));
        var response = controller.streamMessage(principal, command, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_EVENT_STREAM);
        assertThat(response.getHeaders().getFirst("Cache-Control")).isEqualTo("no-cache");
        verify(orchestrator).admit(userId, command);
        verify(orchestrator, never()).executeAdmission(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        StreamingResponseBody body = response.getBody();
        assertThat(body).isNotNull();
        body.writeTo(new ByteArrayOutputStream());
        verify(orchestrator).executeAdmission(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.eq(admission), org.mockito.ArgumentMatchers.eq("request-1"),
                org.mockito.ArgumentMatchers.eq(command),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void turnSseDisablesMvcAsyncTimeoutOnTheActualAsyncRequest() throws Exception {
        var admission = new ChatRuntimePersistenceService.Admission(null, null, null, false);
        when(orchestrator.admit(userId, command)).thenReturn(admission);
        MockMvc mvc = mvcWithShortDefaultTimeout();
        assertChatStreamTimeoutDisabled(mvc, MockMvcRequestBuilders.post("/api/ai/messages/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"protocolVersion\":1,\"action\":\"turn\",\"conversationId\":\""
                        + command.conversationId() + "\",\"requestId\":\"request-1\",\"content\":\"Explain this\"}"));
    }

    @Test
    void retrySseDisablesMvcAsyncTimeoutOnTheActualAsyncRequest() throws Exception {
        UUID conversationId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        var admission = new ChatRuntimePersistenceService.Admission(null, null, null, false);
        when(orchestrator.admitRetry(userId, conversationId, runId, "retry-1")).thenReturn(admission);
        MockMvc mvc = mvcWithShortDefaultTimeout();
        assertChatStreamTimeoutDisabled(mvc, MockMvcRequestBuilders.post(
                "/api/ai/conversations/{conversationId}/runs/{runId}/attempts", conversationId, runId)
                .contentType(MediaType.APPLICATION_JSON).content("{\"requestId\":\"retry-1\"}"));
    }

    @Test
    void recoverUnknownUsesExplicitAttemptIdentityAndReturnsRunStatus() {
        UUID conversationId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        com.auralis.app.ai.ChatRunStatusView status = new com.auralis.app.ai.ChatRunStatusView(1,
                conversationId, runId, "request-1", UUID.randomUUID(), attemptId, UUID.randomUUID(),
                "FAILED", 4, false, java.util.Map.of(), java.util.List.of(), java.util.List.of(),
                null, null, java.util.List.of());
        when(orchestrator.recoverUnknown(userId, conversationId, runId, attemptId)).thenReturn(status);

        assertThat(controller.recoverUnknown(principal, conversationId, runId, attemptId)).isSameAs(status);

        verify(orchestrator).recoverUnknown(userId, conversationId, runId, attemptId);
    }

    @Test
    void clientDisconnectStillEscapesTheSseWriterAsStreamAbort() throws Exception {
        var admission = new ChatRuntimePersistenceService.Admission(null, null, null, false);
        when(orchestrator.admit(userId, command)).thenReturn(admission);
        MockHttpServletRequest request = new MockHttpServletRequest();
        WebAsyncUtils.getAsyncManager(request).setAsyncWebRequest(
                new StandardServletAsyncWebRequest(request, new MockHttpServletResponse()));
        var response = controller.streamMessage(principal, command, request);
        UUID conversationId = command.conversationId();
        org.mockito.Mockito.doAnswer(invocation -> {
            java.util.function.Consumer<ChatSseEnvelope> sink = invocation.getArgument(4);
            sink.accept(new ChatSseEnvelope(1, conversationId, "request-1", UUID.randomUUID(), UUID.randomUUID(),
                    UUID.randomUUID(), UUID.randomUUID(), null, null, 1, "run.started", java.util.Map.of()));
            return null;
        }).when(orchestrator).executeAdmission(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        OutputStream disconnected = new OutputStream() {
            @Override public void write(int value) throws IOException { throw new IOException("closed"); }
        };
        assertThatThrownBy(() -> response.getBody().writeTo(disconnected))
                .isInstanceOf(AiStreamAbortException.class);
    }

    @Test
    void userCancelRouteStillDelegatesToTheRunCancellationOwner() {
        UUID conversationId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        assertThat(controller.cancel(principal, conversationId, runId)).isNull();
        verify(orchestrator).cancel(userId, conversationId, runId);
    }

    private MockMvc mvcWithShortDefaultTimeout() {
        return MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setAsyncRequestTimeout(25L)
                .build();
    }

    private void assertChatStreamTimeoutDisabled(MockMvc mvc, RequestBuilder requestBuilder) throws Exception {
        CountDownLatch streamStarted = new CountDownLatch(1);
        CountDownLatch releaseStream = new CountDownLatch(1);
        doAnswer(invocation -> {
            streamStarted.countDown();
            assertThat(releaseStream.await(3, TimeUnit.SECONDS)).isTrue();
            return null;
        }).when(orchestrator).executeAdmission(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, "test"));
        try {
            MvcResult result = mvc.perform(requestBuilder).andReturn();
            assertThat(result.getRequest().isAsyncStarted()).isTrue();
            assertThat(streamStarted.await(2, TimeUnit.SECONDS)).isTrue();

            assertThat(result.getRequest().getAsyncContext().getTimeout()).isZero();
            Thread.sleep(75L);
            assertThat(result.getRequest().isAsyncStarted()).isTrue();

            releaseStream.countDown();
            result.getAsyncResult(2_000L);
            mvc.perform(asyncDispatch(result)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        } finally {
            releaseStream.countDown();
            SecurityContextHolder.clearContext();
        }
    }
}
