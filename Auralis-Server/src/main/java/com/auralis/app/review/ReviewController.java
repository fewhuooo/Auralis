package com.auralis.app.review;

import com.auralis.app.shared.security.AuthenticatedUser;
import com.auralis.app.shared.pagination.CursorPage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {
    private final ReviewService reviewService;
    private final ReviewLifecycleService lifecycleService;

    public ReviewController(ReviewService reviewService, ReviewLifecycleService lifecycleService) {
        this.reviewService = reviewService;
        this.lifecycleService = lifecycleService;
    }

    @GetMapping("/due")
    public List<ReviewStateView> due(@AuthenticationPrincipal AuthenticatedUser user,
                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant at,
                                     @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return reviewService.due(user.userId(), at == null ? Instant.now() : at, limit);
    }

    @GetMapping("/states")
    public CursorPage<ReviewStateView> states(@AuthenticationPrincipal AuthenticatedUser user,
                                               @RequestParam UUID subjectId,
                                               @RequestParam(required = false) String cursor,
                                               @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return reviewService.states(user.userId(), subjectId, cursor, limit);
    }

    @PostMapping("/events")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public ResponseEntity<ReviewDtos.EventResponse> event(@AuthenticationPrincipal AuthenticatedUser user,
                                                            @Valid @RequestBody ReviewDtos.EventRequest request) {
        var result = reviewService.record(user.userId(), new ReviewEventCommand(request.clientEventId(),
                request.knowledgeBlockId(), request.rating(), request.reviewedAt(), request.durationSeconds(),
                request.baseVersion()));
        return ResponseEntity.created(URI.create("/api/reviews/events/" + result.event().id()))
                .body(new ReviewDtos.EventResponse(result.event(), result.state()));
    }

    @GetMapping("/history")
    public List<ReviewEventView> history(@AuthenticationPrincipal AuthenticatedUser user, @RequestParam UUID knowledgeBlockId) {
        return reviewService.history(user.userId(), knowledgeBlockId);
    }

    @PostMapping("/lifecycle/learning-completions")
    public ReviewLifecycleDtos.CommandResponse learningCompletion(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody ReviewLifecycleDtos.LearningCompletionRequest request) {
        return lifecycleService.completeLearning(user.userId(), request);
    }

    @PostMapping("/lifecycle/attempts")
    public ReviewLifecycleDtos.CommandResponse reviewAttempt(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody ReviewLifecycleDtos.ReviewAttemptRequest request) {
        return lifecycleService.startAttempt(user.userId(), request);
    }

    @PostMapping("/lifecycle/attempts/{reviewId}/confirmations")
    public ReviewLifecycleDtos.CommandResponse confirmReview(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID reviewId,
            @Valid @RequestBody ReviewLifecycleDtos.ReviewResolutionRequest request) {
        return lifecycleService.confirm(user.userId(), reviewId, request);
    }

    @PostMapping("/lifecycle/attempts/{reviewId}/corrections")
    public ReviewLifecycleDtos.CommandResponse correctReview(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID reviewId,
            @Valid @RequestBody ReviewLifecycleDtos.ReviewResolutionRequest request) {
        return lifecycleService.correctAgain(user.userId(), reviewId, request);
    }

    @PostMapping("/lifecycle/learning-reopens")
    public ReviewLifecycleDtos.CommandResponse learningReopen(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody ReviewLifecycleDtos.LearningReopenRequest request) {
        return lifecycleService.reopenLearning(user.userId(), request);
    }

    @GetMapping("/lifecycle/history")
    public ReviewLifecycleDtos.LifecycleHistory lifecycleHistory(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam UUID knowledgeBlockId) {
        return lifecycleService.history(user.userId(), knowledgeBlockId);
    }
}
