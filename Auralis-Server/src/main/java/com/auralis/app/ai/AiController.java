package com.auralis.app.ai;

import com.auralis.app.shared.security.AuthenticatedUser;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.ai.usage.AiUsageSnapshot;
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
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;

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
    private final AiUsageQueryService usageQueryService;
    private final OverviewSseAdapter overviewSseAdapter;

    public AiController(
            AiSettingsService settingsService,
            AiProviderDiscoveryService providerDiscoveryService,
            ConversationService conversationService,
            AiStreamingService streamingService,
            SuggestionService suggestionService,
            OverviewGenerationService overviewGenerationService,
            ObjectMapper objectMapper,
            AiUsageQueryService usageQueryService,
            OverviewSseAdapter overviewSseAdapter) {
        this.settingsService = settingsService;
        this.providerDiscoveryService = providerDiscoveryService;
        this.conversationService = conversationService;
        this.streamingService = streamingService;
        this.suggestionService = suggestionService;
        this.overviewGenerationService = overviewGenerationService;
        this.objectMapper = objectMapper;
        this.usageQueryService = usageQueryService;
        this.overviewSseAdapter = overviewSseAdapter;
    }

    @GetMapping("/usage")
    public AiUsageSnapshot usage(@AuthenticationPrincipal AuthenticatedUser principal) {
        return usageQueryService.snapshotForUser(principal.userId());
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
        streamingService.validatePromptBudget(command);
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

    @Operation(summary = "Generate a source overview", description = "Returns the existing JSON response by default. Accept text/event-stream opts into heartbeat comments and terminal result/error events.")
    @ApiResponse(responseCode = "200", description = "Overview result or opt-in SSE stream", content = {
            @Content(mediaType = "application/json", schema = @Schema(implementation = OverviewDtos.OverviewResponse.class)),
            @Content(mediaType = "text/event-stream", schema = @Schema(type = "string", description = "SSE comments are heartbeats; terminal result data is OverviewResponse and terminal error data is sanitized."))
    })
    @PostMapping(value = "/source-overviews", produces = {MediaType.APPLICATION_JSON_VALUE, MediaType.TEXT_EVENT_STREAM_VALUE})
    public ResponseEntity<?> sourceOverview(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody OverviewDtos.SourceOverviewRequest request,
            @RequestHeader(value = "X-Overview-Request-Id", required = false) String requestId,
            @RequestHeader(value = "Accept", required = false) String accept) {
        if (acceptsEventStream(accept)) {
            var emitter = overviewSseAdapter.source(principal.userId(), request, requestId);
            return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM)
                    .header("Cache-Control", "no-cache")
                    .header("X-Accel-Buffering", "no")
                    .body(emitter);
        }
        try (OverviewSseAdapter.Permit permit = overviewSseAdapter.acquireJsonPermit()) {
            overviewGenerationService.preflightSource(principal.userId(), request);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(overviewGenerationService.generateSource(principal.userId(), request, requestId,
                            null, permit.deadline()));
        }
    }

    @Operation(summary = "Generate a subject overview", description = "Returns the existing JSON response by default. Accept text/event-stream opts into heartbeat comments and terminal result/error events.")
    @ApiResponse(responseCode = "200", description = "Overview result or opt-in SSE stream", content = {
            @Content(mediaType = "application/json", schema = @Schema(implementation = OverviewDtos.OverviewResponse.class)),
            @Content(mediaType = "text/event-stream", schema = @Schema(type = "string", description = "SSE comments are heartbeats; terminal result data is OverviewResponse and terminal error data is sanitized."))
    })
    @PostMapping(value = "/subject-overviews", produces = {MediaType.APPLICATION_JSON_VALUE, MediaType.TEXT_EVENT_STREAM_VALUE})
    public ResponseEntity<?> subjectOverview(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody OverviewDtos.SubjectOverviewRequest request,
            @RequestHeader(value = "X-Overview-Request-Id", required = false) String requestId,
            @RequestHeader(value = "Accept", required = false) String accept) {
        if (acceptsEventStream(accept)) {
            var emitter = overviewSseAdapter.subject(principal.userId(), request, requestId);
            return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM)
                    .header("Cache-Control", "no-cache")
                    .header("X-Accel-Buffering", "no")
                    .body(emitter);
        }
        try (OverviewSseAdapter.Permit permit = overviewSseAdapter.acquireJsonPermit()) {
            overviewGenerationService.preflightSubject(principal.userId(), request);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body(overviewGenerationService.generateSubject(principal.userId(), request, requestId,
                            null, permit.deadline()));
        }
    }

    private boolean acceptsEventStream(String accept) {
        return accept != null && accept.toLowerCase(java.util.Locale.ROOT).contains(MediaType.TEXT_EVENT_STREAM_VALUE)
                && !accept.toLowerCase(java.util.Locale.ROOT).contains(MediaType.APPLICATION_JSON_VALUE);
    }
}
