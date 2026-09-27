package com.auralis.app.ai;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;

import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.NO_CONTENT;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiSettingsService settingsService;
    private final AiProviderDiscoveryService providerDiscoveryService;
    private final ConversationService conversationService;
    private final AiStreamingService streamingService;
    private final SuggestionService suggestionService;
    private final OverviewGenerationService overviewGenerationService;
    private final ObjectMapper objectMapper;

    public AiController(
            AiSettingsService settingsService,
            AiProviderDiscoveryService providerDiscoveryService,
            ConversationService conversationService,
            AiStreamingService streamingService,
            SuggestionService suggestionService,
            OverviewGenerationService overviewGenerationService,
            ObjectMapper objectMapper) {
        this.settingsService = settingsService;
        this.providerDiscoveryService = providerDiscoveryService;
        this.conversationService = conversationService;
        this.streamingService = streamingService;
        this.suggestionService = suggestionService;
        this.overviewGenerationService = overviewGenerationService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/settings")
    public List<AiSettingsView> settings(@AuthenticationPrincipal AuthenticatedUser principal) {
        return settingsService.list(principal.userId());
    }

    @PutMapping("/settings")
    public AiSettingsView updateSettings(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AiSettingsCommand command) {
        return settingsService.upsert(principal.userId(), command);
    }

    @GetMapping("/settings/{provider}/models")
    public AiProviderDiscoveryService.AiModelListView models(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable AiProviderType provider) {
        return providerDiscoveryService.listModels(principal.userId(), provider);
    }

    @PostMapping("/settings/{provider}/test-connection")
    public AiProviderDiscoveryService.AiConnectionTestView testConnection(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable AiProviderType provider) {
        return providerDiscoveryService.testConnection(principal.userId(), provider);
    }

    @GetMapping("/conversations")
    public List<ConversationView> conversations(@AuthenticationPrincipal AuthenticatedUser principal) {
        return conversationService.list(principal.userId());
    }

    @PostMapping("/conversations")
    @ResponseStatus(CREATED)
    public ResponseEntity<ConversationView> createConversation(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody ConversationCommand command) {
        ConversationView view = conversationService.create(principal.userId(), command);
        return ResponseEntity.status(CREATED).body(view);
    }

    @GetMapping("/conversations/{conversationId}")
    public ConversationView conversation(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID conversationId) {
        return conversationService.get(principal.userId(), conversationId);
    }

    @DeleteMapping("/conversations/{conversationId}")
    @ResponseStatus(NO_CONTENT)
    public ResponseEntity<Void> deleteConversation(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID conversationId,
            @RequestParam long baseVersion) {
        conversationService.delete(principal.userId(), conversationId, baseVersion);
        return ResponseEntity.status(NO_CONTENT).build();
    }

    @PostMapping(value = "/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> streamMessage(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AiMessageCommand command) {
        StreamingResponseBody body = output -> {
            streamingService.stream(principal.userId(), command, event -> writeEvent(output, event));
        };
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).body(body);
    }

    private void writeEvent(java.io.OutputStream output, AiStreamEvent event) {
        try {
            output.write(("id: " + event.id() + "\n" +
                    "event: " + event.event() + "\n" +
                    "data: " + objectMapper.writeValueAsString(event.data()) + "\n\n")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));
            output.flush();
        } catch (java.io.IOException exception) {
            throw new AiStreamAbortException("SSE client disconnected", exception);
        }
    }

    @PostMapping("/suggestions")
    public SuggestionView suggestion(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody SuggestionCommand command) {
        return suggestionService.generate(principal.userId(), command);
    }

    @PostMapping("/source-overviews")
    public OverviewDtos.OverviewResponse sourceOverview(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody OverviewDtos.SourceOverviewRequest request,
            @RequestHeader(value = "X-Overview-Request-Id", required = false) String requestId) {
        return overviewGenerationService.generateSource(principal.userId(), request, requestId);
    }

    @PostMapping("/subject-overviews")
    public OverviewDtos.OverviewResponse subjectOverview(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody OverviewDtos.SubjectOverviewRequest request,
            @RequestHeader(value = "X-Overview-Request-Id", required = false) String requestId) {
        return overviewGenerationService.generateSubject(principal.userId(), request, requestId);
    }
}
