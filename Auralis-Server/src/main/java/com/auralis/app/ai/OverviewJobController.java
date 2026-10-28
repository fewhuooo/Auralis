package com.auralis.app.ai;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/ai/overview-jobs")
public class OverviewJobController {
    private final OverviewJobService service;
    private final OverviewPublicationService publicationService;
    private final OverviewPreviewService previewService;

    public OverviewJobController(OverviewJobService service, OverviewPublicationService publicationService,
                                 OverviewPreviewService previewService) {
        this.service = service;
        this.publicationService = publicationService;
        this.previewService = previewService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OverviewJobDtos.JobView start(@AuthenticationPrincipal AuthenticatedUser user,
                                         @Valid @RequestBody OverviewJobDtos.StartRequest request) {
        return service.start(user.userId(), request);
    }

    @GetMapping
    public OverviewJobDtos.JobList list(@AuthenticationPrincipal AuthenticatedUser user,
                                        @RequestParam(defaultValue = "20") int limit,
                                        @RequestParam(required = false) String cursor,
                                        @RequestParam(required = false) OverviewJobDtos.Scope scope,
                                        @RequestParam(required = false) UUID scopeId) {
        return service.list(user.userId(), limit, cursor, scope, scopeId);
    }

    @GetMapping("/{id}")
    public OverviewJobDtos.JobView get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
        return service.get(user.userId(), id);
    }

    @GetMapping("/{id}/candidate")
    public OverviewJobDtos.Candidate candidate(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
        return service.candidate(user.userId(), id);
    }

    @PostMapping("/{id}/publish")
    public OverviewPublicationDtos.PublicationView publish(@AuthenticationPrincipal AuthenticatedUser user,
                                                           @PathVariable UUID id,
                                                           @Valid @RequestBody OverviewPublicationDtos.PublishRequest request) {
        return publicationService.publish(user.userId(), id, request);
    }

    @GetMapping("/{id}/publication")
    public OverviewPublicationDtos.PublicationView publication(@AuthenticationPrincipal AuthenticatedUser user,
                                                                @PathVariable UUID id) {
        return publicationService.get(user.userId(), id);
    }

    @GetMapping("/{id}/preview")
    public OverviewPreviewDtos.Page preview(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
                                            @RequestParam(defaultValue = "20") int limit,
                                            @RequestParam(required = false) String cursor) {
        return previewService.page(user.userId(), id, limit, cursor);
    }

    @GetMapping("/{id}/preview/{nodeId}")
    public OverviewPreviewDtos.NodeView previewNode(@AuthenticationPrincipal AuthenticatedUser user,
                                                     @PathVariable UUID id, @PathVariable UUID nodeId,
                                                     @RequestParam UUID planId) {
        return previewService.node(user.userId(), id, nodeId, planId);
    }

    @PostMapping("/{id}/pause")
    public OverviewJobDtos.JobView pause(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
                                         @Valid @RequestBody OverviewJobDtos.ControlRequest request) {
        return service.control(user.userId(), id, request, OverviewJobRepository.Control.PAUSE);
    }

    @PostMapping("/{id}/resume")
    public OverviewJobDtos.JobView resume(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
                                          @Valid @RequestBody OverviewJobDtos.ControlRequest request) {
        return service.control(user.userId(), id, request, OverviewJobRepository.Control.RESUME);
    }

    @PostMapping("/{id}/cancel")
    public OverviewJobDtos.JobView cancel(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
                                          @Valid @RequestBody OverviewJobDtos.ControlRequest request) {
        return service.control(user.userId(), id, request, OverviewJobRepository.Control.CANCEL);
    }

    @PostMapping("/{id}/reconcile")
    public OverviewJobDtos.JobView reconcile(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
                                             @Valid @RequestBody OverviewJobDtos.ControlRequest request) {
        return service.control(user.userId(), id, request, OverviewJobRepository.Control.RECONCILE);
    }
}
