package com.auralis.app.subject;

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
@RequestMapping("/api/subjects")
public class SubjectController {

    private final SubjectService subjectService;

    public SubjectController(SubjectService subjectService) {
        this.subjectService = subjectService;
    }

    @PostMapping
    @ResponseStatus(CREATED)
    public ResponseEntity<SubjectDtos.Response> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody SubjectDtos.CreateRequest request) {
        requireCreateVersion(request.baseVersion());
        SubjectDtos.Response response = SubjectDtos.Response.from(
                subjectService.create(principal.userId(), request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/subjects/" + response.id()))
                .body(response);
    }

    @GetMapping
    public SubjectDtos.ListResponse list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        var page = subjectService.list(principal.userId(), cursor, limit);
        return new SubjectDtos.ListResponse(
                page.items().stream().map(SubjectDtos.Response::from).toList(),
                page.nextCursor(), page.hasMore());
    }

    @GetMapping("/{id}")
    public SubjectDtos.Response get(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return SubjectDtos.Response.from(subjectService.get(principal.userId(), id));
    }

    @PutMapping("/{id}")
    public SubjectDtos.Response update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SubjectDtos.UpdateRequest request) {
        return SubjectDtos.Response.from(subjectService.update(
                principal.userId(), id, request.baseVersion(), request.command()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(NO_CONTENT)
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SubjectDtos.VersionRequest request) {
        subjectService.delete(principal.userId(), id, request.baseVersion());
        return ResponseEntity.status(NO_CONTENT).build();
    }

    @PostMapping("/{id}/restore")
    public SubjectDtos.Response restore(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SubjectDtos.VersionRequest request) {
        return SubjectDtos.Response.from(subjectService.restore(
                principal.userId(), id, request.baseVersion()));
    }

    private void requireCreateVersion(Long baseVersion) {
        if (baseVersion != 0) {
            throw new com.auralis.app.shared.error.DomainException(
                    "VALIDATION_FAILED", "Create baseVersion must be 0");
        }
    }
}
