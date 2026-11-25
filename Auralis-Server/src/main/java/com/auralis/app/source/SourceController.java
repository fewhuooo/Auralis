package com.auralis.app.source;

import com.auralis.app.shared.security.AuthenticatedUser;
import com.auralis.app.subject.SubjectService;
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
@RequestMapping("/api/sources")
public class SourceController {

    private final SourceService sourceService;
    private final SubjectService subjectService;

    public SourceController(SourceService sourceService, SubjectService subjectService) {
        this.sourceService = sourceService;
        this.subjectService = subjectService;
    }

    @PostMapping
    @ResponseStatus(CREATED)
    public ResponseEntity<SourceDtos.Response> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody SourceDtos.CreateRequest request) {
        requireCreateVersion(request.baseVersion());
        SourceDtos.Response response = SourceDtos.Response.from(
                sourceService.create(principal.userId(), request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/sources/" + response.id()))
                .body(response);
    }

    @GetMapping
    public SourceDtos.ListResponse list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam(required = false) UUID subjectId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        if (subjectId != null) {
            subjectService.get(principal.userId(), subjectId);
        }
        var page = sourceService.list(principal.userId(), subjectId, cursor, limit);
        return new SourceDtos.ListResponse(
                page.items().stream().map(SourceDtos.Response::from).toList(),
                page.nextCursor(), page.hasMore());
    }

    @GetMapping("/{id}")
    public SourceDtos.Response get(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return SourceDtos.Response.from(sourceService.get(principal.userId(), id));
    }

    @PutMapping("/{id}")
    public SourceDtos.Response update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SourceDtos.UpdateRequest request) {
        return SourceDtos.Response.from(sourceService.update(
                principal.userId(), id, request.baseVersion(), request.command()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(NO_CONTENT)
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SourceDtos.VersionRequest request) {
        sourceService.delete(principal.userId(), id, request.baseVersion());
        return ResponseEntity.status(NO_CONTENT).build();
    }

    @PostMapping("/{id}/restore")
    public SourceDtos.Response restore(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SourceDtos.VersionRequest request) {
        return SourceDtos.Response.from(sourceService.restore(
                principal.userId(), id, request.baseVersion()));
    }

    @PostMapping("/{id}/reingest")
    public SourceDtos.Response reingest(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SourceDtos.VersionRequest request) {
        return SourceDtos.Response.from(sourceService.reingest(
                principal.userId(), id, request.baseVersion()));
    }

    private void requireCreateVersion(Long baseVersion) {
        if (baseVersion != 0) {
            throw new com.auralis.app.shared.error.DomainException(
                    "VALIDATION_FAILED", "Create baseVersion must be 0");
        }
    }
}
