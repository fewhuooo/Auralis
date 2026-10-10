package com.auralis.app.review;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import io.swagger.v3.oas.annotations.media.Schema;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ReviewLifecycleDtos {
    private ReviewLifecycleDtos() { }

    public record LearningCompletionRequest(
            @NotNull UUID clientCommandId,
            @NotNull UUID knowledgeBlockId,
            @NotNull @Min(0) Long knowledgeBlockVersion,
            @NotNull @Min(0) Long baseVersion,
            @NotNull @Pattern(regexp = "[0-9a-f]{64}") String contentHash,
            UUID reviewId,
            @Schema(nullable = true, types = {"string", "null"}) Instant occurredAt,
            @Schema(nullable = true, types = {"boolean", "null"}) Boolean expectedStateAbsent) { }

    public record ReviewAttemptRequest(
            @NotNull UUID clientCommandId,
            @NotNull UUID knowledgeBlockId,
            @NotNull @Min(0) Long knowledgeBlockVersion,
            @NotNull @Min(0) Long baseVersion,
            @NotNull @Pattern(regexp = "[0-9a-f]{64}") String contentHash,
            @NotNull UUID reviewId,
            @NotNull ReviewLifecycleRating rating,
            @Min(0) int durationSeconds,
            @Schema(nullable = true, types = {"string", "null"}) Instant occurredAt,
            @Schema(nullable = true, types = {"boolean", "null"}) Boolean expectedStateAbsent) { }

    public record ReviewResolutionRequest(
            @NotNull UUID clientCommandId,
            @NotNull UUID knowledgeBlockId,
            @NotNull @Min(0) Long knowledgeBlockVersion,
            @NotNull @Min(0) Long baseVersion,
            @NotNull @Pattern(regexp = "[0-9a-f]{64}") String contentHash,
            @Schema(nullable = true, types = {"string", "null"}) Instant occurredAt,
            @Schema(nullable = true, types = {"boolean", "null"}) Boolean expectedStateAbsent) { }

    public record LearningReopenRequest(
            @NotNull UUID clientCommandId,
            @NotNull UUID knowledgeBlockId,
            @NotNull @Min(0) Long knowledgeBlockVersion,
            @NotNull @Min(0) Long baseVersion,
            @NotNull @Pattern(regexp = "[0-9a-f]{64}") String contentHash,
            UUID reviewId,
            @Schema(nullable = true, types = {"string", "null"}) Instant occurredAt,
            @Schema(nullable = true, types = {"boolean", "null"}) Boolean expectedStateAbsent) { }

    public record CommandResponse(UUID commandId, UUID clientCommandId,
                                  @Schema(allowableValues = {"LEARNING_COMPLETED", "REVIEW_SELECTED",
                                          "REVIEW_CONFIRMED", "REVIEW_CORRECTED", "LEARNING_REOPENED"}) String action,
                                  Instant occurredAt,
                                  long knowledgeBlockVersion, ReviewStateView state,
                                  @Schema(nullable = true, types = {"object", "null"}) EffectiveReview effectiveReview) { }

    public record EffectiveReview(UUID reviewId, ReviewLifecycleRating selectedRating,
                                  @Schema(nullable = true, types = {"string", "null"}) ReviewLifecycleRating effectiveRating,
                                  Instant selectedAt, @Schema(nullable = true, types = {"string", "null"}) Instant resolvedAt,
                                  @Schema(nullable = true, types = {"string", "null"}, allowableValues = {
                                          "AGAIN_SELECTED", "CONFIRMED", "CORRECTED_AGAIN", "SUPERSEDED"})
                                  String resolution,
                                  @Schema(nullable = true, types = {"object", "null"})
                                  @JsonInclude(JsonInclude.Include.NON_NULL) SchedulingBaseline schedulingBaseline) { }

    public record SchedulingBaseline(
            @Schema(nullable = true, types = {"string", "null"}) Instant dueAt,
            boolean mastered,
            int stableSuccessCount,
            @Schema(nullable = true, types = {"string", "null"}, allowableValues = {
                    "EARLY_RECALL", "CROSS_DAY", "FINAL_VERIFICATION"}) String nextReviewStage,
            @Schema(nullable = true, types = {"string", "null"}) Instant lastPracticeAt,
            double stability) { }

    public record CommandHistory(UUID commandId, UUID clientCommandId,
                                 @Schema(allowableValues = {"LEARNING_COMPLETED", "REVIEW_SELECTED",
                                         "REVIEW_CONFIRMED", "REVIEW_CORRECTED", "LEARNING_REOPENED"}) String action,
                                 Instant occurredAt, UUID reviewId,
                                 @Schema(nullable = true, types = {"string", "null"}) ReviewLifecycleRating rating,
                                 Integer durationSeconds,
                                 long baseVersion, long knowledgeBlockVersion) { }

    public record LifecycleHistory(UUID knowledgeBlockId, long knowledgeBlockVersion, int protocolVersion,
                                   @Schema(nullable = true, types = {"object", "null"}) ReviewStateView state,
                                   List<CommandHistory> commands, List<EffectiveReview> effectiveReviews) {
        public LifecycleHistory {
            commands = List.copyOf(commands);
            effectiveReviews = List.copyOf(effectiveReviews);
        }
    }
}
