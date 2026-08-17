package com.auralis.app.knowledge;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.NO_CONTENT;

@RestController
@RequestMapping("/api/knowledge-blocks")
public class KnowledgeBlockController {

    private final KnowledgeBlockService knowledgeBlockService;

    public KnowledgeBlockController(KnowledgeBlockService knowledgeBlockService) {
        this.knowledgeBlockService = knowledgeBlockService;
    }

    @PostMapping
    @ResponseStatus(CREATED)
    public ResponseEntity<KnowledgeBlockDtos.Response> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody KnowledgeBlockDtos.CreateRequest request) {
        requireCreateVersion(request.baseVersion());
        KnowledgeBlockDtos.Response response = KnowledgeBlockDtos.Response.from(
                knowledgeBlockService.create(principal.userId(), request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/knowledge-blocks/" + response.id()))
                .body(response);
    }

    @GetMapping
    public KnowledgeBlockDtos.ListResponse list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        var page = knowledgeBlockService.list(principal.userId(), cursor, limit);
        return new KnowledgeBlockDtos.ListResponse(
                page.items().stream().map(KnowledgeBlockDtos.Response::from).toList(),
                page.nextCursor(), page.hasMore());
    }

    @GetMapping("/{id}")
    public KnowledgeBlockDtos.Response get(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return KnowledgeBlockDtos.Response.from(knowledgeBlockService.get(principal.userId(), id));
    }

    @PutMapping("/{id}")
    public KnowledgeBlockDtos.Response update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody KnowledgeBlockDtos.UpdateRequest request) {
        return KnowledgeBlockDtos.Response.from(knowledgeBlockService.update(
                principal.userId(), id, request.baseVersion(), request.command()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(NO_CONTENT)
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody KnowledgeBlockDtos.VersionRequest request) {
        knowledgeBlockService.delete(principal.userId(), id, request.baseVersion());
        return ResponseEntity.status(NO_CONTENT).build();
    }

    @PostMapping("/{id}/restore")
    public KnowledgeBlockDtos.Response restore(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody KnowledgeBlockDtos.VersionRequest request) {
        return KnowledgeBlockDtos.Response.from(knowledgeBlockService.restore(
                principal.userId(), id, request.baseVersion()));
    }

    private void requireCreateVersion(Long baseVersion) {
        if (baseVersion != 0) {
            throw new com.auralis.app.shared.error.DomainException(
                    "VALIDATION_FAILED", "Create baseVersion must be 0");
        }
    }
}
