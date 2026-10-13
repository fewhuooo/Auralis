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
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.security.AuthenticatedUser;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
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

@SpringBootTest(classes = AuralisApplication.class, properties = "auralis.ai.max-prompt-chars=64")
@ActiveProfiles("test")
@AutoConfigureMockMvc
class AiStreamingControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void deserializesTheTopLevelSelectionFieldAlongsideLegacyFields() throws Exception {
        AiMessageCommand command = objectMapper.readValue(
                "{\"content\":\"Question\",\"retrievalEnabled\":false,\"selectionText\":\"selected\"}",
                AiMessageCommand.class);

        assertThat(command.selectionText()).isEqualTo("selected");
        assertThat(command.effectiveSelectionText()).isEqualTo("selected");
    }

    @Test
    void requiresAuthenticationForStreamingMessages() throws Exception {
        mockMvc.perform(post("/api/ai/messages/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"hello\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void rejectsQuotedPromptThatCannotFitBeforeStartingTheSseResponse() throws Exception {
        var auth = identityService.register(
                "selected-text-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple", "selected-text-controller",
                new DeviceCommand("selected-text-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));

        mockMvc.perform(post("/api/ai/messages/stream")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Question\","
                                + "\"selectionText\":\"quote\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.detail")
                        .value("The selected text and current question exceed the prompt budget"));
    }

    @Test
    void validatesTopLevelSelectionTextLimit() throws Exception {
        var auth = identityService.register(
                "sl-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple", "selected-text-controller",
                new DeviceCommand("selected-text-limit-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));

        mockMvc.perform(post("/api/ai/messages/stream")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Question\",\"selectionText\":\""
                                + "x".repeat(4001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("selectionText"));
    }

    @Test
    void writesProviderEventsToSseOutputAsTheyArrive() throws Exception {
        AiStreamingService streamingService = mock(AiStreamingService.class);
        UUID userId = UUID.randomUUID();
        AiMessageCommand command = new AiMessageCommand(
                UUID.randomUUID(), "hello", AiProviderType.DEEPSEEK, 3, "request-controller");
        doAnswer(invocation -> {
            AiStreamSink sink = invocation.getArgument(2);
            sink.emit(new AiStreamEvent("message.started", "user-1", Map.of("messageId", "user-1")));
            sink.emit(new AiStreamEvent("message.delta", "user-1", "hello"));
            return null;
        }).when(streamingService).stream(eq(userId), eq(command), any(AiStreamSink.class));
        AiController controller = new AiController(
                mock(AiSettingsService.class),
                mock(com.auralis.app.ai.AiProviderDiscoveryService.class),
                mock(ConversationService.class),
                streamingService,
                mock(SuggestionService.class),
                mock(com.auralis.app.ai.OverviewGenerationService.class),
                new ObjectMapper(), mock(com.auralis.app.ai.usage.AiUsageQueryService.class),
                mock(com.auralis.app.ai.OverviewSseAdapter.class));

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        controller.streamMessage(new AuthenticatedUser(userId, UUID.randomUUID(), UUID.randomUUID()), command)
                .getBody()
                .writeTo(output);

        String body = output.toString(StandardCharsets.UTF_8);
        assertThat(body).contains("event: message.started", "event: message.delta", "data: \"hello\"");
    }
}
