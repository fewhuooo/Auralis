package com.auralis.app;

import com.auralis.app.ai.AiController;
import com.auralis.app.ai.AiMessageCommand;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiStreamEvent;
import com.auralis.app.ai.AiStreamSink;
import com.auralis.app.ai.AiStreamingService;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.SuggestionService;
import com.auralis.app.shared.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class AiStreamingControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void requiresAuthenticationForStreamingMessages() throws Exception {
        mockMvc.perform(post("/api/ai/messages/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"hello\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void writesProviderEventsToSseOutputAsTheyArrive() throws Exception {
        AiStreamingService streamingService = mock(AiStreamingService.class);
        UUID userId = UUID.randomUUID();
        AiMessageCommand command = new AiMessageCommand(
                UUID.randomUUID(), "hello", AiProviderType.DEEPSEEK, false, 3, "request-controller");
        doAnswer(invocation -> {
            AiStreamSink sink = invocation.getArgument(2);
            sink.emit(new AiStreamEvent("message.started", "user-1", Map.of("messageId", "user-1")));
            sink.emit(new AiStreamEvent("message.delta", "user-1", "hello"));
            return null;
        }).when(streamingService).stream(eq(userId), eq(command), any(AiStreamSink.class));
        AiController controller = new AiController(
                mock(AiSettingsService.class),
                mock(ConversationService.class),
                streamingService,
                mock(SuggestionService.class),
                new ObjectMapper());

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        controller.streamMessage(new AuthenticatedUser(userId, UUID.randomUUID(), UUID.randomUUID()), command)
                .getBody()
                .writeTo(output);

        String body = output.toString(StandardCharsets.UTF_8);
        assertThat(body).contains("event: message.started", "event: message.delta", "data: \"hello\"");
    }
}
