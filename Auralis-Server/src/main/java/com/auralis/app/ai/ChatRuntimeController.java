package com.auralis.app.ai;

import com.auralis.app.ai.internal.chat.ChatAgentOrchestrator;
import com.auralis.app.ai.internal.chat.ChatRuntimePersistenceService;
import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai")
public class ChatRuntimeController {
    private final ChatAgentOrchestrator orchestrator;
    private final TextGenerationService textGeneration;
    private final ObjectMapper mapper;

    public ChatRuntimeController(ChatAgentOrchestrator orchestrator, TextGenerationService textGeneration,
                                 ObjectMapper mapper) {
        this.orchestrator = orchestrator; this.textGeneration = textGeneration; this.mapper = mapper;
    }

    @PostMapping(value = "/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> streamMessage(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AiMessageCommand command) {
        ChatRuntimePersistenceService.Admission admission = orchestrator.admit(principal.userId(), command);
        StreamingResponseBody body = output -> orchestrator.executeAdmission(principal.userId(), admission,
                command.requestId(), command, event -> writeEvent(output, event));
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM)
                .header("Cache-Control", "no-cache")
                .header("X-Accel-Buffering", "no")
                .body(body);
    }

    @PostMapping(value = "/conversations/{conversationId}/runs/{runId}/attempts",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> retry(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID conversationId, @PathVariable UUID runId,
            @Valid @RequestBody ChatRetryCommand command) {
        ChatRuntimePersistenceService.Admission admission = orchestrator.admitRetry(principal.userId(),
                conversationId, runId, command.requestId());
        StreamingResponseBody body = output -> orchestrator.executeAdmission(principal.userId(), admission,
                command.requestId(), null, event -> writeEvent(output, event));
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM)
                .header("Cache-Control", "no-cache")
                .header("X-Accel-Buffering", "no")
                .body(body);
    }

    @GetMapping("/conversations/{conversationId}/runs/{runId}")
    public ChatRunStatusView status(@AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID conversationId, @PathVariable UUID runId) {
        return orchestrator.status(principal.userId(), conversationId, runId);
    }

    @PostMapping("/conversations/{conversationId}/runs/{runId}/cancel")
    public ChatRunStatusView cancel(@AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID conversationId, @PathVariable UUID runId) {
        return orchestrator.cancel(principal.userId(), conversationId, runId);
    }

    @PostMapping("/text-generations")
    public TextGenerationView generateText(@AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody TextGenerationCommand command) {
        return textGeneration.generate(principal.userId(), command);
    }

    private void writeEvent(java.io.OutputStream output, ChatSseEnvelope event) {
        try {
            output.write(("id: " + event.sequence() + "\n" + "event: " + event.event() + "\n"
                    + "data: " + mapper.writeValueAsString(event) + "\n\n").getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (IOException exception) {
            throw new AiStreamAbortException("SSE client disconnected", exception);
        }
    }
}
