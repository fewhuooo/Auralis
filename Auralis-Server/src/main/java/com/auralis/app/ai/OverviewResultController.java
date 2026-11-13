package com.auralis.app.ai;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/overview-results")
public class OverviewResultController {
    private final OverviewResultService service;

    public OverviewResultController(OverviewResultService service) {
        this.service = service;
    }

    @GetMapping("/sources/{sourceId}")
    public OverviewResultView getSource(@AuthenticationPrincipal AuthenticatedUser user,
                                        @PathVariable UUID sourceId,
                                        @RequestParam(required = false) UUID ingestionRevision) {
        return service.getSource(user.userId(), sourceId, ingestionRevision);
    }

    @PutMapping("/sources/{sourceId}")
    public OverviewResultView putSource(@AuthenticationPrincipal AuthenticatedUser user,
                                        @PathVariable UUID sourceId,
                                        @Valid @RequestBody OverviewResultCommand command) {
        return service.putSource(user.userId(), sourceId, command);
    }

    @GetMapping("/subjects/{subjectId}")
    public OverviewResultView getSubject(@AuthenticationPrincipal AuthenticatedUser user,
                                         @PathVariable UUID subjectId) {
        return service.getSubject(user.userId(), subjectId);
    }

    @PostMapping("/subjects/statuses")
    public OverviewSubjectStatusesResponse getSubjectStatuses(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody OverviewSubjectStatusesRequest request) {
        return service.getSubjectStatuses(user.userId(), request);
    }

    @PutMapping("/subjects/{subjectId}")
    public OverviewResultView putSubject(@AuthenticationPrincipal AuthenticatedUser user,
                                         @PathVariable UUID subjectId,
                                         @Valid @RequestBody OverviewResultCommand command) {
        return service.putSubject(user.userId(), subjectId, command);
    }
}
