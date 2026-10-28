package com.auralis.app.ai;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @GetMapping("/sources/{sourceId}/outline")
    public OverviewOutlineView getSourceOutline(@AuthenticationPrincipal AuthenticatedUser user,
                                                 @PathVariable UUID sourceId) {
        return service.getSourceOutline(user.userId(), sourceId);
    }

    @GetMapping("/sources/{sourceId}/sections/{sectionId}")
    public OverviewSectionView getSourceSection(@AuthenticationPrincipal AuthenticatedUser user,
                                                 @PathVariable UUID sourceId, @PathVariable UUID sectionId,
                                                 @RequestParam long version) {
        return service.getSourceSection(user.userId(), sourceId, sectionId, version);
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

    @GetMapping("/subjects/{subjectId}/outline")
    public OverviewOutlineView getSubjectOutline(@AuthenticationPrincipal AuthenticatedUser user,
                                                  @PathVariable UUID subjectId) {
        return service.getSubjectOutline(user.userId(), subjectId);
    }

    @GetMapping("/subjects/{subjectId}/sections/{sectionId}")
    public OverviewSectionView getSubjectSection(@AuthenticationPrincipal AuthenticatedUser user,
                                                  @PathVariable UUID subjectId, @PathVariable UUID sectionId,
                                                  @RequestParam long version) {
        return service.getSubjectSection(user.userId(), subjectId, sectionId, version);
    }

    @PutMapping("/subjects/{subjectId}")
    public OverviewResultView putSubject(@AuthenticationPrincipal AuthenticatedUser user,
                                         @PathVariable UUID subjectId,
                                         @Valid @RequestBody OverviewResultCommand command) {
        return service.putSubject(user.userId(), subjectId, command);
    }
}
