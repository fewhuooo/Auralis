package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class TextGenerationService {
    private final AiSettingsService settings;
    private final AiInvocationGateway gateway;
    private final AuralisProperties properties;

    public TextGenerationService(AiSettingsService settings, AiInvocationGateway gateway, AuralisProperties properties) {
        this.settings = settings; this.gateway = gateway; this.properties = properties;
    }

    public TextGenerationView generate(UUID userId, TextGenerationCommand command) {
        if (command == null || command.input() == null || command.input().isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "input is required");
        }
        String operation = normalizeOperation(command.operation());
        AiSettingsService.ResolvedSettings resolved = settings.resolve(userId, AiProviderType.OPENAI_COMPATIBLE);
        String taskKey = command.requestId() == null || command.requestId().isBlank()
                ? UUID.randomUUID().toString() : command.requestId().trim();
        UUID budgetId = UUID.nameUUIDFromBytes(("auralis:text-generation:" + userId + ":" + taskKey)
                .getBytes(StandardCharsets.UTF_8));
        AiTaskContext context = new AiTaskContext(userId, AiFeature.CHAT, "text-generation:" + taskKey,
                budgetId, AiOperationKind.TEXT_GENERATION);
        AiProviderRequest request = new AiProviderRequest(resolved.chatModel(), List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, instruction(operation)),
                new AiProviderRequest.Message(AiMessageRole.USER, command.input().trim())),
                0.2, 4096);
        try (AiTaskScope scope = gateway.beginTask(context)) {
            var result = scope.completeChat(AiStage.CHAT_COMPLETION, resolved.provider(), request,
                    resolved.credential(), resolved.source(), properties.ai().requestTimeoutMillis(),
                    new OverviewCancellation());
            if (result.value() == null || result.value().content() == null) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "Text generation returned no content");
            }
            return new TextGenerationView(result.value().content());
        }
    }

    private String normalizeOperation(String value) {
        String operation = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!List.of("summary", "extract", "format", "transcript").contains(operation)) {
            throw new DomainException("VALIDATION_FAILED", "operation is not supported");
        }
        return operation;
    }
    private String instruction(String operation) {
        return switch (operation) {
            case "summary" -> "Summarize the supplied text accurately. Do not add facts. Return only the summary.";
            case "extract" -> "Extract the requested information from the supplied text. Follow the requested output format and return only the result.";
            case "format" -> "Format the supplied text as clear Markdown without adding unsupported facts. Return only the formatted text.";
            default -> "Transcribe or clean up the supplied transcript while preserving its meaning. Return only the text.";
        };
    }
}
