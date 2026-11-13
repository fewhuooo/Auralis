package com.auralis.app.source;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class ParsedDocumentDtos {

    private ParsedDocumentDtos() {
    }

    @Schema(name = "ParsedDocumentUploadIntentRequest")
    public record UploadIntentRequest(
            @NotNull UUID ingestionRevision,
            @NotNull @Positive @Max(1) Integer schemaVersion,
            @NotBlank @Size(max = 128) String parserId,
            @NotBlank @Size(max = 128) String parserVersion,
            @NotBlank @Size(max = 128) String normalizationVersion,
            @Schema(nullable = true) @Size(max = 160) String ocrModelVersion,
            @NotNull @Pattern(regexp = "[0-9a-fA-F]{64}") String sourceAssetSha256,
            @NotBlank @Pattern(regexp = "[0-9a-fA-F]{64}") String payloadSha256,
            @NotNull @Positive long sizeBytes) {

        public ParsedDocumentUploadCommand command() {
            return new ParsedDocumentUploadCommand(
                    ingestionRevision, schemaVersion, parserId, parserVersion,
                    normalizationVersion, ocrModelVersion, sourceAssetSha256,
                    payloadSha256, sizeBytes);
        }
    }

    @Schema(name = "ParsedDocumentUploadIntentResponse")
    public record UploadIntentResponse(
            UUID parsedDocumentId,
            UUID ingestionRevision,
            String uploadUrl,
            Map<String, String> headers,
            Instant expiresAt) {

        static UploadIntentResponse from(ParsedDocumentUploadIntentView view) {
            return new UploadIntentResponse(
                    view.parsedDocumentId(), view.ingestionRevision(),
                    view.uploadUrl(), view.headers(), view.expiresAt());
        }
    }

    @Schema(name = "ParsedDocumentCompleteResponse")
    public record CompleteResponse(
            UUID parsedDocumentId,
            ParsedDocumentStatus status,
            UUID generation,
            UUID ingestionJobId) {

        static CompleteResponse from(ParsedDocumentCompleteView view) {
            return new CompleteResponse(
                    view.parsedDocumentId(), view.status(), view.generation(), view.ingestionJobId());
        }
    }
}
