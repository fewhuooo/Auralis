package com.auralis.app.relation;

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
@RequestMapping("/api/relations")
public class RelationController {

    private final RelationService relationService;

    public RelationController(RelationService relationService) {
        this.relationService = relationService;
    }

    @PostMapping
    @ResponseStatus(CREATED)
    public ResponseEntity<RelationDtos.Response> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody RelationDtos.CreateRequest request) {
        requireCreateVersion(request.baseVersion());
        RelationDtos.Response response = RelationDtos.Response.from(
                relationService.create(principal.userId(), request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/relations/" + response.id()))
                .body(response);
    }

    @GetMapping
    public RelationDtos.ListResponse list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        var page = relationService.list(principal.userId(), cursor, limit);
        return new RelationDtos.ListResponse(
                page.items().stream().map(RelationDtos.Response::from).toList(),
                page.nextCursor(), page.hasMore());
    }

    @GetMapping("/{id}")
    public RelationDtos.Response get(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return RelationDtos.Response.from(relationService.get(principal.userId(), id));
    }

    @PutMapping("/{id}")
    public RelationDtos.Response update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody RelationDtos.UpdateRequest request) {
        return RelationDtos.Response.from(relationService.update(
                principal.userId(), id, request.baseVersion(), request.command()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(NO_CONTENT)
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody RelationDtos.VersionRequest request) {
        relationService.delete(principal.userId(), id, request.baseVersion());
        return ResponseEntity.status(NO_CONTENT).build();
    }

    @PostMapping("/{id}/restore")
    public RelationDtos.Response restore(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody RelationDtos.VersionRequest request) {
        return RelationDtos.Response.from(relationService.restore(
                principal.userId(), id, request.baseVersion()));
    }

    private void requireCreateVersion(Long baseVersion) {
        if (baseVersion != 0) {
            throw new com.auralis.app.shared.error.DomainException(
                    "VALIDATION_FAILED", "Create baseVersion must be 0");
        }
    }
}
