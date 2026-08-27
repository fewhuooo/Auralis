package com.auralis.app.source;

import com.auralis.app.shared.security.AuthenticatedUser;
import com.auralis.app.shared.error.ApiProblemDetails;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;

@RestController
@RequestMapping("/api/sources/{sourceId}/parsed-documents")
public class ParsedDocumentController {

    private final ParsedDocumentService parsedDocumentService;

    public ParsedDocumentController(ParsedDocumentService parsedDocumentService) {
        this.parsedDocumentService = parsedDocumentService;
    }

    @PostMapping("/upload-intents")
    @ResponseStatus(CREATED)
    @ApiResponses({
            @ApiResponse(responseCode = "409", description = "INGESTION_REVISION_STALE",
                    content = @Content(schema = @Schema(implementation = ApiProblemDetails.class)))
    })
    public ResponseEntity<ParsedDocumentDtos.UploadIntentResponse> createUploadIntent(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID sourceId,
            @Valid @RequestBody ParsedDocumentDtos.UploadIntentRequest request) {
        ParsedDocumentDtos.UploadIntentResponse response = ParsedDocumentDtos.UploadIntentResponse.from(
                parsedDocumentService.createUploadIntent(
                        principal.userId(), sourceId, request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/sources/" + sourceId + "/parsed-documents/"
                        + response.parsedDocumentId()))
                .body(response);
    }

    @PostMapping("/{parsedDocumentId}/complete")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "OK",
                    content = @Content(schema = @Schema(implementation = ParsedDocumentDtos.CompleteResponse.class))),
            @ApiResponse(responseCode = "409", description = "PARSED_DOCUMENT_CONFLICT or INGESTION_REVISION_STALE",
                    content = @Content(schema = @Schema(implementation = ApiProblemDetails.class)))
    })
    public ParsedDocumentDtos.CompleteResponse complete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID sourceId,
            @PathVariable UUID parsedDocumentId) {
        return ParsedDocumentDtos.CompleteResponse.from(
                parsedDocumentService.complete(principal.userId(), sourceId, parsedDocumentId));
    }
}
