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
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

        assertThatThrownBy(() -> controller.streamMessage(principal, command)).isSameAs(busy);

        verify(orchestrator).admit(userId, command);
        verify(orchestrator, never()).executeAdmission(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void successfulAdmissionReturnsSseHeadersAndDefersExecutionToBody() throws Exception {
        var admission = new ChatRuntimePersistenceService.Admission(null, null, null, false);
        when(orchestrator.admit(userId, command)).thenReturn(admission);

        var response = controller.streamMessage(principal, command);

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
}
