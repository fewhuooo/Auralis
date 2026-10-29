package com.auralis.app.ai;

import tools.jackson.databind.JsonNode;
import com.auralis.app.ai.retrieval.ReadingContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/** Protocol 1 command for both ordinary turns and activity submissions. */
public record AiMessageCommand(
        @NotNull @Schema(description = "Chat protocol version; only 1 is supported", example = "1") Integer protocolVersion,
        @NotBlank @Size(max = 32) @Schema(description = "turn or activity_submission", allowableValues = {"turn", "activity_submission"}) String action,
        @NotNull UUID conversationId,
        @NotBlank @Size(max = 128) String requestId,
        @Size(max = 12000) String content,
        @Valid ReadingContext readingContext,
        @Size(max = 4000) String selectionText,
        UUID activityId,
        Integer questionVersion,
        UUID submissionId,
        @Schema(oneOf = {String.class, String[].class},
                description = "For open questions, a raw nonblank string. For single or multi choice, a raw array of option keys.",
                example = "[\"A\"]") JsonNode answer) {

    public AiMessageCommand {
        if (requestId != null) requestId = requestId.trim();
        if (content != null) content = content.trim();
        if (selectionText != null) selectionText = selectionText.trim();
    }

    public String effectiveSelectionText() {
        return selectionText != null ? selectionText
                : readingContext == null ? null : readingContext.selectionText();
    }

    public void validateProtocol() {
        if (!Integer.valueOf(1).equals(protocolVersion)) {
            throw new com.auralis.app.shared.error.DomainException("CHAT_PROTOCOL_UNSUPPORTED",
                    "Only Chat protocol 1 is supported");
        }
        if (requestId == null || requestId.isBlank()) {
            throw new com.auralis.app.shared.error.DomainException("VALIDATION_FAILED", "requestId is required");
        }
        if ("turn".equals(action)) {
            if (content == null || content.isBlank()) {
                throw new com.auralis.app.shared.error.DomainException("VALIDATION_FAILED", "content is required");
            }
            if (activityId != null || questionVersion != null || submissionId != null || answer != null) {
                throw new com.auralis.app.shared.error.DomainException("VALIDATION_FAILED", "Activity fields are not allowed for turn");
            }
        } else if ("activity_submission".equals(action)) {
            if (activityId == null || questionVersion == null || questionVersion < 1
                    || submissionId == null || answer == null || content != null || !isCanonicalAnswerShape()) {
                throw new com.auralis.app.shared.error.DomainException("VALIDATION_FAILED", "Activity submission fields are invalid");
            }
        } else {
            throw new com.auralis.app.shared.error.DomainException("VALIDATION_FAILED", "action must be turn or activity_submission");
        }
    }

    private boolean isCanonicalAnswerShape() {
        if (answer.isTextual()) return true;
        if (!answer.isArray()) return false;
        for (JsonNode item : answer) if (!item.isTextual()) return false;
        return true;
    }
}
