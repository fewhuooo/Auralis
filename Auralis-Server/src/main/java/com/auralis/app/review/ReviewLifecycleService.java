package com.auralis.app.review;

import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.knowledge.KnowledgeBlockContentHash;
import com.auralis.app.knowledge.KnowledgeBlockView;
import com.auralis.app.review.ReviewLifecycleDtos.CommandHistory;
import com.auralis.app.review.ReviewLifecycleDtos.CommandResponse;
import com.auralis.app.review.ReviewLifecycleDtos.EffectiveReview;
import com.auralis.app.review.ReviewLifecycleDtos.LifecycleHistory;
import com.auralis.app.review.internal.persistence.ReviewLifecycleCommandEntity;
import com.auralis.app.review.internal.persistence.ReviewLifecycleCommandRepository;
import com.auralis.app.review.internal.persistence.ReviewLifecycleReviewEntity;
import com.auralis.app.review.internal.persistence.ReviewLifecycleReviewRepository;
import com.auralis.app.review.internal.persistence.ReviewParameterSetEntity;
import com.auralis.app.review.internal.persistence.ReviewParameterSetRepository;
import com.auralis.app.review.internal.persistence.ReviewStateEntity;
import com.auralis.app.review.internal.persistence.ReviewStateRepository;
import com.auralis.app.shared.domain.KnowledgeBlockContentChangedEvent;
import com.auralis.app.shared.domain.KnowledgeBlockSubjectChangedEvent;
import com.auralis.app.shared.domain.ReviewChangedEvent;
import com.auralis.app.shared.error.DomainException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import java.time.Instant;
import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
public class ReviewLifecycleService {
    private static final String PARAMETER_SET_SCHEDULER = "FSRS_LITE";
    private static final int PARAMETER_VERSION = 1;
    private static final Duration MAX_FUTURE_OCCURRENCE = Duration.ofMinutes(5);
    private static final UUID DEFAULT_PARAMETER_ID = UUID.nameUUIDFromBytes(
            "auralis-review-fsrs-lite-v1".getBytes(java.nio.charset.StandardCharsets.UTF_8));

    private final ReviewStateRepository stateRepository;
    private final ReviewLifecycleCommandRepository commandRepository;
    private final ReviewLifecycleReviewRepository lifecycleReviewRepository;
    private final ReviewParameterSetRepository parameterSetRepository;
    private final KnowledgeBlockService knowledgeBlockService;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;
    @PersistenceContext
    private EntityManager entityManager;

    public ReviewLifecycleService(ReviewStateRepository stateRepository,
                                  ReviewLifecycleCommandRepository commandRepository,
                                  ReviewLifecycleReviewRepository lifecycleReviewRepository,
                                  ReviewParameterSetRepository parameterSetRepository,
                                  KnowledgeBlockService knowledgeBlockService,
                                  ObjectMapper objectMapper,
                                  ApplicationEventPublisher eventPublisher,
                                  Clock clock) {
        this.stateRepository = stateRepository;
        this.commandRepository = commandRepository;
        this.lifecycleReviewRepository = lifecycleReviewRepository;
        this.parameterSetRepository = parameterSetRepository;
        this.knowledgeBlockService = knowledgeBlockService;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    @Transactional
    public CommandResponse completeLearning(UUID userId, ReviewLifecycleDtos.LearningCompletionRequest request) {
        require(request);
        KnowledgeBlockView block = lockAndValidateBlockContent(userId, request.knowledgeBlockId(), request.contentHash());
        ReviewStateEntity current = lockState(userId, block.id());
        String payload = fingerprint("LEARNING_COMPLETED", request.clientCommandId(), request.knowledgeBlockId(),
                request.knowledgeBlockVersion(), request.baseVersion(), request.contentHash(), request.reviewId(), null,
                null, request.occurredAt(), request.expectedStateAbsent());
        CommandResponse replay = replay(userId, request.clientCommandId(), payload);
        if (replay != null) return replay;
        requireBlockVersion(block, request.knowledgeBlockVersion(), current);
        requireExpectedStatePresence(current, request.expectedStateAbsent(), block.version());
        requireStateVersion(current, request.baseVersion(), block.version());

        Instant occurredAt = resolveOccurredAt(request.occurredAt());
        requireCausalOccurredAt(userId, block.id(), current, occurredAt, block.version());
        boolean firstLearning = current == null;
        if (firstLearning && request.reviewId() != null) {
            throw rejected("A first learning completion cannot reference a review attempt");
        }
        if (!firstLearning && !current.isNeedsLearning()) {
            throw rejected("Knowledge block is not waiting for learning");
        }
        if (request.reviewId() != null) {
            requireCurrentAgainChain(userId, block, current, request.reviewId(), false);
        }

        current = current == null ? newState(userId, block.id(), occurredAt) : current;
        lifecycleReviewRepository.supersedeUnresolved(userId, block.id());
        long intervalMinutes = firstLearning ? 3L * 24 * 60 : 10L;
        String nextStage = firstLearning ? "CROSS_DAY" : "EARLY_RECALL";
        current.applyLifecycle(current.getStability(), occurredAt.plus(intervalMinutes, ChronoUnit.MINUTES),
                occurredAt, false, false, 0, nextStage, current.getLastReviewId(), null, request.contentHash());
        current = stateRepository.saveAndFlush(current);
        return saveCommand(userId, block, request.clientCommandId(), "LEARNING_COMPLETED", occurredAt,
                request.baseVersion(), request.contentHash(), request.reviewId(), null, null, payload,
                current, null);
    }

    @Transactional
    public CommandResponse startAttempt(UUID userId, ReviewLifecycleDtos.ReviewAttemptRequest request) {
        require(request);
        KnowledgeBlockView block = lockAndValidateBlockContent(userId, request.knowledgeBlockId(), request.contentHash());
        ReviewStateEntity current = lockState(userId, block.id());
        ReviewRating rating = ReviewRating.valueOf(request.rating().name());
        String payload = fingerprint("REVIEW_SELECTED", request.clientCommandId(), request.knowledgeBlockId(),
                request.knowledgeBlockVersion(), request.baseVersion(), request.contentHash(), request.reviewId(),
                rating, request.durationSeconds(), request.occurredAt(), request.expectedStateAbsent());
        CommandResponse replay = replay(userId, request.clientCommandId(), payload);
        if (replay != null) return replay;
        requireBlockVersion(block, request.knowledgeBlockVersion(), current);
        requireExpectedStatePresence(current, request.expectedStateAbsent(), block.version());
        requireStateVersion(current, request.baseVersion(), block.version());
        Instant occurredAt = resolveOccurredAt(request.occurredAt());
        requireCausalOccurredAt(userId, block.id(), current, occurredAt, block.version());
        if (current == null || current.isNeedsLearning()) {
            throw rejected("Knowledge block must be learned before a review attempt");
        }
        if (lifecycleReviewRepository.existsById(request.reviewId())) {
            throw rejected("reviewId was already used");
        }

        String beforeState = snapshotText(current);
        lifecycleReviewRepository.supersedeUnresolved(userId, block.id());
        Schedule schedule = selectSchedule(current, rating, occurredAt);
        boolean again = rating == ReviewRating.AGAIN;
        boolean hard = rating == ReviewRating.HARD;
        int stable = again || hard ? 0 : current.getStableSuccessCount();
        boolean mastered = again || hard ? false : current.isMastered();
        boolean needsLearning = again;
        String stage = again ? "EARLY_RECALL" : hard ? "CROSS_DAY" : schedule.nextStage();
        ReviewLifecycleReviewEntity lifecycleReview = new ReviewLifecycleReviewEntity(
                request.reviewId(), userId, block.id(), rating.name(),
                again ? ReviewRating.AGAIN.name() : null,
                occurredAt, again ? occurredAt : null, again ? "AGAIN_SELECTED" : null,
                request.durationSeconds(), block.version(), request.contentHash(), beforeState);
        lifecycleReviewRepository.save(lifecycleReview);
        current.applyLifecycle(current.getStability(), schedule.dueAt(), occurredAt, needsLearning,
                mastered, stable, stage, request.reviewId(), again ? null : request.reviewId(), request.contentHash());
        current = stateRepository.saveAndFlush(current);
        return saveCommand(userId, block, request.clientCommandId(), "REVIEW_SELECTED", occurredAt,
                request.baseVersion(), request.contentHash(), request.reviewId(), rating,
                request.durationSeconds(), payload, current, lifecycleReview);
    }

    @Transactional
    public CommandResponse confirm(UUID userId, UUID reviewId, ReviewLifecycleDtos.ReviewResolutionRequest request) {
        require(request);
        KnowledgeBlockView block = lockAndValidateBlockContent(userId, request.knowledgeBlockId(), request.contentHash());
        ReviewStateEntity current = lockState(userId, block.id());
        String payload = fingerprint("REVIEW_CONFIRMED", request.clientCommandId(), request.knowledgeBlockId(),
                request.knowledgeBlockVersion(), request.baseVersion(), request.contentHash(), reviewId, null, null,
                request.occurredAt(), request.expectedStateAbsent());
        CommandResponse replay = replay(userId, request.clientCommandId(), payload);
        if (replay != null) return replay;
        requireBlockVersion(block, request.knowledgeBlockVersion(), current);
        requireExpectedStatePresence(current, request.expectedStateAbsent(), block.version());
        requireStateVersion(current, request.baseVersion(), block.version());
        Instant occurredAt = resolveOccurredAt(request.occurredAt());
        requireCausalOccurredAt(userId, block.id(), current, occurredAt, block.version());
        if (current == null || !reviewId.equals(current.getPendingReviewId())) {
            throw rejected("Review attempt is no longer awaiting confirmation");
        }
        ReviewLifecycleReviewEntity lifecycleReview = requireReview(userId, block.id(), reviewId);
        if (lifecycleReview.getEffectiveRating() != null || lifecycleReview.getResolution() != null
                || ("AGAIN".equals(lifecycleReview.getSelectedRating()))) {
            throw rejected("Review attempt cannot be confirmed");
        }
        if (!lifecycleReview.getContentHash().equals(request.contentHash())) {
            throw rejected("Review attempt no longer matches current content");
        }
        LifecycleSnapshot before = parseSnapshot(lifecycleReview.getBeforeState());
        ReviewRating selectedRating = ReviewRating.valueOf(lifecycleReview.getSelectedRating());
        if (selectedRating == ReviewRating.GOOD) {
            Schedule schedule = confirmedGood(before, lifecycleReview.getSelectedAt());
            current.applyLifecycle(current.getStability(), schedule.dueAt(), lifecycleReview.getSelectedAt(),
                    false, schedule.mastered(), schedule.stableSuccessCount(), schedule.nextStage(), reviewId,
                    null, request.contentHash());
        } else {
            current.applyLifecycle(current.getStability(), lifecycleReview.getSelectedAt().plus(1, ChronoUnit.DAYS),
                    lifecycleReview.getSelectedAt(), false, false, 0, "CROSS_DAY", reviewId,
                    null, request.contentHash());
        }
        lifecycleReview.confirm(selectedRating.name(), occurredAt);
        lifecycleReviewRepository.save(lifecycleReview);
        current = stateRepository.saveAndFlush(current);
        return saveCommand(userId, block, request.clientCommandId(), "REVIEW_CONFIRMED", occurredAt,
                request.baseVersion(), request.contentHash(), reviewId, selectedRating, null, payload,
                current, lifecycleReview);
    }

    @Transactional
    public CommandResponse correctAgain(UUID userId, UUID reviewId,
                                        ReviewLifecycleDtos.ReviewResolutionRequest request) {
        require(request);
        KnowledgeBlockView block = lockAndValidateBlockContent(userId, request.knowledgeBlockId(), request.contentHash());
        ReviewStateEntity current = lockState(userId, block.id());
        String payload = fingerprint("REVIEW_CORRECTED", request.clientCommandId(), request.knowledgeBlockId(),
                request.knowledgeBlockVersion(), request.baseVersion(), request.contentHash(), reviewId,
                ReviewRating.AGAIN, null, request.occurredAt(), request.expectedStateAbsent());
        CommandResponse replay = replay(userId, request.clientCommandId(), payload);
        if (replay != null) return replay;
        requireBlockVersion(block, request.knowledgeBlockVersion(), current);
        requireExpectedStatePresence(current, request.expectedStateAbsent(), block.version());
        requireStateVersion(current, request.baseVersion(), block.version());
        Instant occurredAt = resolveOccurredAt(request.occurredAt());
        requireCausalOccurredAt(userId, block.id(), current, occurredAt, block.version());
        if (current == null || !reviewId.equals(current.getLastReviewId())) {
            throw rejected("Review attempt is no longer the current correction target");
        }
        ReviewLifecycleReviewEntity lifecycleReview = requireReview(userId, block.id(), reviewId);
        if (!lifecycleReview.getContentHash().equals(request.contentHash())) {
            throw rejected("Review attempt no longer matches current content");
        }
        if (lifecycleReview.getResolution() != null && "SUPERSEDED".equals(lifecycleReview.getResolution())) {
            throw rejected("Review attempt was superseded");
        }
        if (current.getPendingReviewId() != null && !reviewId.equals(current.getPendingReviewId())) {
            throw rejected("A later review attempt has replaced this correction target");
        }
        if (lifecycleReview.getEffectiveRating() == null
                && !reviewId.equals(current.getPendingReviewId())) {
            throw rejected("Review attempt is not available for correction");
        }
        if (!ReviewRating.AGAIN.name().equals(lifecycleReview.getEffectiveRating())) {
            LifecycleSnapshot before = parseSnapshot(lifecycleReview.getBeforeState());
            current.applyLifecycle(before.stability(), occurredAt.plus(10, ChronoUnit.MINUTES), occurredAt,
                    true, false, 0, "EARLY_RECALL", reviewId, null, request.contentHash());
            lifecycleReview.correctAgain(occurredAt);
            lifecycleReviewRepository.supersedeUnresolved(userId, block.id());
            lifecycleReviewRepository.save(lifecycleReview);
        } else {
            // A later failure in the same learning/consolidation chain reopens learning without adding a result.
            current.applyLifecycle(current.getStability(), occurredAt.plus(10, ChronoUnit.MINUTES), occurredAt,
                    true, false, 0, "EARLY_RECALL", reviewId, null, request.contentHash());
            if (!"CORRECTED_AGAIN".equals(lifecycleReview.getResolution())) {
                lifecycleReview.correctAgain(occurredAt);
                lifecycleReviewRepository.save(lifecycleReview);
            }
        }
        current = stateRepository.saveAndFlush(current);
        return saveCommand(userId, block, request.clientCommandId(), "REVIEW_CORRECTED", occurredAt,
                request.baseVersion(), request.contentHash(), reviewId, ReviewRating.AGAIN, null, payload,
                current, lifecycleReview);
    }

    @Transactional
    public CommandResponse reopenLearning(UUID userId, ReviewLifecycleDtos.LearningReopenRequest request) {
        require(request);
        KnowledgeBlockView block = lockAndValidateBlockContent(userId, request.knowledgeBlockId(), request.contentHash());
        ReviewStateEntity current = lockState(userId, block.id());
        String payload = fingerprint("LEARNING_REOPENED", request.clientCommandId(), request.knowledgeBlockId(),
                request.knowledgeBlockVersion(), request.baseVersion(), request.contentHash(), request.reviewId(), null,
                null, request.occurredAt(), request.expectedStateAbsent());
        CommandResponse replay = replay(userId, request.clientCommandId(), payload);
        if (replay != null) return replay;
        requireBlockVersion(block, request.knowledgeBlockVersion(), current);
        requireExpectedStatePresence(current, request.expectedStateAbsent(), block.version());
        requireStateVersion(current, request.baseVersion(), block.version());
        Instant occurredAt = resolveOccurredAt(request.occurredAt());
        requireCausalOccurredAt(userId, block.id(), current, occurredAt, block.version());
        if (request.reviewId() != null) {
            requireCurrentAgainChain(userId, block, current, request.reviewId(), true);
        }
        current = current == null ? newState(userId, block.id(), occurredAt) : current;
        if (request.reviewId() == null) {
            lifecycleReviewRepository.supersedeUnresolved(userId, block.id());
        }
        current.applyLifecycle(current.getStability(), occurredAt, current.getLastPracticeAt(), true,
                false, 0, "EARLY_RECALL", request.reviewId(), null, request.contentHash());
        current = stateRepository.saveAndFlush(current);
        return saveCommand(userId, block, request.clientCommandId(), "LEARNING_REOPENED", occurredAt,
                request.baseVersion(), request.contentHash(), request.reviewId(), null, null, payload,
                current, request.reviewId() == null ? null : requireReview(userId, block.id(), request.reviewId()));
    }

    @Transactional(readOnly = true)
    public LifecycleHistory history(UUID userId, UUID knowledgeBlockId) {
        KnowledgeBlockView block = knowledgeBlockService.get(userId, knowledgeBlockId);
        ReviewStateEntity current = stateRepository.findByUserIdAndKnowledgeBlockId(userId, knowledgeBlockId)
                .orElse(null);
        List<CommandHistory> commands = commandRepository
                .findAllByUserIdAndKnowledgeBlockIdOrderByOccurredAtAscIdAsc(userId, knowledgeBlockId).stream()
                .map(command -> new CommandHistory(command.getId(), command.getClientCommandId(), command.getAction(),
                        command.getOccurredAt(), command.getReviewId(), parseRating(command.getRating()),
                        command.getDurationSeconds(), command.getBaseVersion(), command.getKnowledgeBlockVersion()))
                .toList();
        List<EffectiveReview> reviews = lifecycleReviewRepository
                .findAllByUserIdAndKnowledgeBlockIdOrderBySelectedAtAscReviewIdAsc(userId, knowledgeBlockId).stream()
                .map(this::view)
                .toList();
        return new LifecycleHistory(knowledgeBlockId, block.version(), 2,
                current == null ? null : stateView(current, block.version()),
                commands, reviews);
    }

    @EventListener
    @Transactional
    public void onContentChanged(KnowledgeBlockContentChangedEvent event) {
        ReviewStateEntity current = stateRepository.findForUpdateByUserIdAndKnowledgeBlockId(
                event.userId(), event.knowledgeBlockId()).orElse(null);
        if (current == null) return;
        lifecycleReviewRepository.supersedeUnresolved(event.userId(), event.knowledgeBlockId());
        current.invalidateForContent(event.contentHash());
        current = stateRepository.saveAndFlush(current);
        eventPublisher.publishEvent(new ReviewChangedEvent(event.userId(), event.knowledgeBlockId(),
                current.getVersion(), now()));
    }

    @EventListener
    @Transactional
    public void onSubjectChanged(KnowledgeBlockSubjectChangedEvent event) {
        ReviewStateEntity current = lockState(event.userId(), event.knowledgeBlockId());
        if (current == null || (current.getLastReviewId() == null && current.getPendingReviewId() == null)) return;
        lifecycleReviewRepository.supersedeUnresolved(event.userId(), event.knowledgeBlockId());
        current.clearCausalReview();
        current = stateRepository.saveAndFlush(current);
        eventPublisher.publishEvent(new ReviewChangedEvent(event.userId(), event.knowledgeBlockId(),
                current.getVersion(), now()));
    }

    private CommandResponse saveCommand(UUID userId, KnowledgeBlockView block, UUID clientCommandId,
                                        String action, Instant occurredAt, long baseVersion, String contentHash,
                                        UUID reviewId, ReviewRating rating, Integer durationSeconds, String payload,
                                        ReviewStateEntity state, ReviewLifecycleReviewEntity lifecycleReview) {
        // All command paths have flushed the state. Freeze the actual database
        // representation (including timestamp precision), not the managed
        // entity's pre-round-trip audit timestamps.
        entityManager.refresh(state);
        CommandResponse response = new CommandResponse(UUID.randomUUID(), clientCommandId, action, occurredAt,
                block.version(), stateView(state, block.version()), lifecycleReview == null ? null : view(lifecycleReview));
        String responseText = json(response);
        ReviewLifecycleCommandEntity command = new ReviewLifecycleCommandEntity(response.commandId(), userId,
                block.id(), clientCommandId, action, occurredAt, block.version(), baseVersion, reviewId,
                rating == null ? null : rating.name(), durationSeconds, contentHash, payload, responseText);
        commandRepository.saveAndFlush(command);
        eventPublisher.publishEvent(new ReviewChangedEvent(userId, block.id(), state.getVersion(), occurredAt));
        return response;
    }

    private CommandResponse replay(UUID userId, UUID clientCommandId, String requestPayload) {
        ReviewLifecycleCommandEntity prior = commandRepository.findByUserIdAndClientCommandId(userId, clientCommandId)
                .orElse(null);
        if (prior == null) return null;
        if (!prior.getRequestPayload().equals(requestPayload)) {
            throw rejected("clientCommandId was already used with different content");
        }
        try {
            return objectMapper.readValue(prior.getResponsePayload(), CommandResponse.class);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Lifecycle command receipt could not be read");
        }
    }

    private KnowledgeBlockView lockAndValidateBlockContent(UUID userId, UUID blockId, String contentHash) {
        KnowledgeBlockView block = knowledgeBlockService.requireActiveKnowledgeBlockForMutation(userId, blockId);
        if (!KnowledgeBlockContentHash.sha256(block.content()).equals(contentHash)) {
            throw blockConflict(block, lockState(userId, blockId));
        }
        return block;
    }

    private void requireBlockVersion(KnowledgeBlockView block, long version, ReviewStateEntity current) {
        if (block.version() != version) throw blockConflict(block, current);
    }

    private DomainException blockConflict(KnowledgeBlockView block, ReviewStateEntity current) {
        return new DomainException("RESOURCE_VERSION_CONFLICT", "Knowledge block content/version does not match",
                current == null ? null : stateView(current, block.version()));
    }

    private ReviewStateEntity lockState(UUID userId, UUID blockId) {
        return stateRepository.findForUpdateByUserIdAndKnowledgeBlockId(userId, blockId).orElse(null);
    }

    private void requireStateVersion(ReviewStateEntity current, long baseVersion, long blockVersion) {
        if (current == null && baseVersion != 0 || current != null && current.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Review state version does not match",
                    current == null ? null : stateView(current, blockVersion));
        }
    }

    private void requireCurrentAgainChain(UUID userId, KnowledgeBlockView block, ReviewStateEntity current,
                                          UUID reviewId, boolean reopen) {
        if (current == null || !reviewId.equals(current.getLastReviewId())) {
            throw rejected("reviewId is not the current causal review attempt");
        }
        ReviewLifecycleReviewEntity review = requireReview(userId, block.id(), reviewId);
        if (!ReviewRating.AGAIN.name().equals(review.getEffectiveRating())
                || !review.getContentHash().equals(KnowledgeBlockContentHash.sha256(block.content()))) {
            throw rejected(reopen
                    ? "Learning reopen must reference the current AGAIN review attempt"
                    : "Learning completion reviewId must reference the current AGAIN review attempt");
        }
    }

    private ReviewLifecycleReviewEntity requireReview(UUID userId, UUID blockId, UUID reviewId) {
        return lifecycleReviewRepository.findByUserIdAndKnowledgeBlockIdAndReviewId(userId, blockId, reviewId)
                .orElseThrow(() -> rejected("Review attempt was not found"));
    }

    private Schedule selectSchedule(ReviewStateEntity current, ReviewRating rating, Instant selectedAt) {
        if (rating == ReviewRating.AGAIN) return new Schedule(selectedAt.plus(10, ChronoUnit.MINUTES), "EARLY_RECALL", false,
                0);
        if (rating == ReviewRating.HARD) return new Schedule(selectedAt.plus(1, ChronoUnit.DAYS), "CROSS_DAY", false, 0);
        if (current.isMastered()) {
            return new Schedule(current.getDueAt(), null, true, current.getStableSuccessCount());
        }
        if ("EARLY_RECALL".equals(current.getNextReviewStage())) {
            return new Schedule(selectedAt.plus(3, ChronoUnit.DAYS), "CROSS_DAY", false,
                    current.getStableSuccessCount());
        }
        if (current.getDueAt().isAfter(selectedAt)) {
            if (current.getStableSuccessCount() >= 3) {
                return new Schedule(selectedAt.plus(30, ChronoUnit.DAYS), "FINAL_VERIFICATION", false, 3);
            }
            return new Schedule(current.getDueAt(), current.getNextReviewStage() == null
                    ? "CROSS_DAY" : current.getNextReviewStage(), false, current.getStableSuccessCount());
        }
        return switch (current.getStableSuccessCount()) {
            case 0 -> new Schedule(selectedAt.plus(7, ChronoUnit.DAYS), "CROSS_DAY", false, 1);
            case 1 -> new Schedule(selectedAt.plus(14, ChronoUnit.DAYS), "CROSS_DAY", false, 2);
            case 2 -> new Schedule(selectedAt.plus(30, ChronoUnit.DAYS), "FINAL_VERIFICATION", false, 3);
            default -> new Schedule(selectedAt.plus(30, ChronoUnit.DAYS), "FINAL_VERIFICATION", false, 3);
        };
    }

    private Schedule confirmedGood(LifecycleSnapshot before, Instant selectedAt) {
        if (before.mastered()) {
            return new Schedule(before.dueAt(), null, true, before.stableSuccessCount());
        }
        if ("EARLY_RECALL".equals(before.nextReviewStage())) {
            return new Schedule(selectedAt.plus(3, ChronoUnit.DAYS), "CROSS_DAY", false,
                    before.stableSuccessCount());
        }
        boolean wasDue = before.dueAt() == null || !before.dueAt().isAfter(selectedAt);
        if (!wasDue) {
            if (before.stableSuccessCount() >= 3) {
                return new Schedule(selectedAt.plus(30, ChronoUnit.DAYS), "FINAL_VERIFICATION", false, 3);
            }
            return new Schedule(before.dueAt(), before.nextReviewStage() == null
                    ? "CROSS_DAY" : before.nextReviewStage(), false, before.stableSuccessCount());
        }
        return switch (before.stableSuccessCount()) {
            case 0 -> new Schedule(selectedAt.plus(7, ChronoUnit.DAYS), "CROSS_DAY", false, 1);
            case 1 -> new Schedule(selectedAt.plus(14, ChronoUnit.DAYS), "CROSS_DAY", false, 2);
            case 2 -> new Schedule(selectedAt.plus(30, ChronoUnit.DAYS), "FINAL_VERIFICATION", false, 3);
            default -> {
                boolean validated = before.lastPracticeAt() == null
                        || !selectedAt.isBefore(before.lastPracticeAt().plus(30, ChronoUnit.DAYS));
                yield new Schedule(selectedAt.plus(30, ChronoUnit.DAYS),
                        validated ? null : "FINAL_VERIFICATION", validated, 3);
            }
        };
    }

    private String snapshotText(ReviewStateEntity state) {
        LifecycleSnapshot snapshot = new LifecycleSnapshot(true, state.getDifficulty(), state.getStability(),
                state.getDueAt(), state.getLastReviewedAt(), state.getReps(), state.getLapses(),
                state.isNeedsLearning(), state.isMastered(), state.getStableSuccessCount(),
                state.getNextReviewStage(), state.getLastPracticeAt(), state.getLastReviewId(),
                state.getPendingReviewId(), state.getContentHash());
        return json(snapshot);
    }

    private LifecycleSnapshot parseSnapshot(String value) {
        try {
            return objectMapper.readValue(value, LifecycleSnapshot.class);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Review attempt scheduling snapshot could not be read");
        }
    }

    private ReviewStateEntity newState(UUID userId, UUID blockId, Instant now) {
        ReviewParameterSetEntity parameters = parameterSetRepository.findBySchedulerAndVersion(
                        PARAMETER_SET_SCHEDULER, PARAMETER_VERSION)
                .orElseGet(() -> parameterSetRepository.saveAndFlush(new ReviewParameterSetEntity(
                        DEFAULT_PARAMETER_ID, PARAMETER_SET_SCHEDULER, PARAMETER_VERSION,
                        "{\"againMinutes\":10,\"hardFactor\":1.2,\"goodFactor\":2.0,\"easyFactor\":3.0}")));
        return new ReviewStateEntity(UUID.randomUUID(), userId, blockId, parameters.getId(), 5.0, 0.0, now);
    }

    private ReviewStateView stateView(ReviewStateEntity state, long blockVersion) {
        return new ReviewStateView(state.getId(), state.getUserId(), state.getKnowledgeBlockId(),
                state.getParameterSetId(), state.getDifficulty(), state.getStability(), state.getDueAt(),
                state.getLastReviewedAt(), state.getReps(), state.getLapses(), state.getVersion(),
                state.getCreatedAt(), state.getUpdatedAt(), blockVersion, state.isNeedsLearning(),
                state.isMastered(), state.getStableSuccessCount(), state.getNextReviewStage(),
                state.getLastPracticeAt(), state.getLastReviewId(), state.getPendingReviewId(), state.getContentHash());
    }

    private EffectiveReview view(ReviewLifecycleReviewEntity review) {
        return new EffectiveReview(review.getReviewId(), ReviewLifecycleRating.valueOf(review.getSelectedRating()),
                parseRating(review.getEffectiveRating()), review.getSelectedAt(), review.getResolvedAt(),
                review.getResolution(), schedulingBaseline(review));
    }

    private ReviewLifecycleDtos.SchedulingBaseline schedulingBaseline(ReviewLifecycleReviewEntity review) {
        LifecycleSnapshot before = parseSnapshot(review.getBeforeState());
        if (!before.exists()) return null;
        return new ReviewLifecycleDtos.SchedulingBaseline(before.dueAt(), before.mastered(),
                before.stableSuccessCount(), before.nextReviewStage(), before.lastPracticeAt(), before.stability());
    }

    private ReviewLifecycleRating parseRating(String value) {
        return value == null ? null : ReviewLifecycleRating.valueOf(value);
    }

    private String fingerprint(String action, UUID clientCommandId, UUID blockId, long blockVersion,
                               long baseVersion, String contentHash, UUID reviewId, ReviewRating rating,
                               Integer durationSeconds, Instant occurredAt, Boolean expectedStateAbsent) {
        Instant normalizedOccurredAt = occurredAt == null ? null : occurredAt.truncatedTo(ChronoUnit.MICROS);
        if (normalizedOccurredAt == null && expectedStateAbsent == null) {
            return json(new CommandFingerprint(action, clientCommandId, blockId, blockVersion, baseVersion,
                    contentHash, reviewId, rating, durationSeconds));
        }
        return json(new OfflineCommandFingerprint(action, clientCommandId, blockId, blockVersion, baseVersion,
                contentHash, reviewId, rating, durationSeconds, normalizedOccurredAt, expectedStateAbsent));
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Lifecycle command could not be serialized");
        }
    }

    private void require(ReviewLifecycleDtos.LearningCompletionRequest request) {
        if (request == null || request.clientCommandId() == null || request.knowledgeBlockId() == null
                || request.contentHash() == null || request.knowledgeBlockVersion() == null
                || request.baseVersion() == null || request.knowledgeBlockVersion() < 0 || request.baseVersion() < 0) {
            throw new DomainException("VALIDATION_FAILED", "Lifecycle command fields are required");
        }
        requireHash(request.contentHash());
    }

    private void require(ReviewLifecycleDtos.ReviewAttemptRequest request) {
        if (request == null || request.clientCommandId() == null || request.knowledgeBlockId() == null
                || request.contentHash() == null || request.reviewId() == null || request.rating() == null
                || request.knowledgeBlockVersion() == null || request.baseVersion() == null
                || request.knowledgeBlockVersion() < 0 || request.baseVersion() < 0 || request.durationSeconds() < 0) {
            throw new DomainException("VALIDATION_FAILED", "Lifecycle command fields are required");
        }
        requireHash(request.contentHash());
    }

    private void require(ReviewLifecycleDtos.ReviewResolutionRequest request) {
        if (request == null || request.clientCommandId() == null || request.knowledgeBlockId() == null
                || request.contentHash() == null || request.knowledgeBlockVersion() == null
                || request.baseVersion() == null || request.knowledgeBlockVersion() < 0 || request.baseVersion() < 0) {
            throw new DomainException("VALIDATION_FAILED", "Lifecycle command fields are required");
        }
        requireHash(request.contentHash());
    }

    private void require(ReviewLifecycleDtos.LearningReopenRequest request) {
        if (request == null || request.clientCommandId() == null || request.knowledgeBlockId() == null
                || request.contentHash() == null || request.knowledgeBlockVersion() == null
                || request.baseVersion() == null || request.knowledgeBlockVersion() < 0 || request.baseVersion() < 0) {
            throw new DomainException("VALIDATION_FAILED", "Lifecycle command fields are required");
        }
        requireHash(request.contentHash());
    }

    private void requireHash(String hash) {
        if (!hash.matches("[0-9a-f]{64}")) {
            throw new DomainException("VALIDATION_FAILED", "contentHash must be lower-case SHA-256 hex");
        }
    }

    private Instant resolveOccurredAt(Instant requested) {
        Instant serverNow = now();
        if (requested == null) return serverNow;
        Instant normalized = requested.truncatedTo(ChronoUnit.MICROS);
        if (normalized.isAfter(serverNow.plus(MAX_FUTURE_OCCURRENCE))) {
            throw new DomainException("VALIDATION_FAILED", "occurredAt is too far in the future");
        }
        return normalized;
    }

    private void requireExpectedStatePresence(ReviewStateEntity current, Boolean expectedStateAbsent,
                                              long blockVersion) {
        if (expectedStateAbsent == null) return;
        if (expectedStateAbsent && current != null || !expectedStateAbsent && current == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Review state presence does not match",
                    current == null ? null : stateView(current, blockVersion));
        }
    }

    private void requireCausalOccurredAt(UUID userId, UUID blockId, ReviewStateEntity current,
                                         Instant occurredAt, long blockVersion) {
        Instant latest = current == null ? null : later(current.getLastReviewedAt(), current.getLastPracticeAt());
        ReviewLifecycleCommandEntity latestCommand = commandRepository
                .findTopByUserIdAndKnowledgeBlockIdOrderByOccurredAtDescIdDesc(userId, blockId).orElse(null);
        if (latestCommand != null) latest = later(latest, latestCommand.getOccurredAt());
        if (latest != null && occurredAt.isBefore(latest)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "occurredAt precedes the latest practice",
                    current == null ? null : stateView(current, blockVersion));
        }
    }

    private Instant later(Instant left, Instant right) {
        if (left == null) return right;
        if (right == null || left.isAfter(right)) return left;
        return right;
    }

    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }

    private DomainException rejected(String message) { return new DomainException("MUTATION_REJECTED", message); }

    private record Schedule(Instant dueAt, String nextStage, boolean mastered, int stableSuccessCount) { }
    private record CommandFingerprint(String action, UUID clientCommandId, UUID knowledgeBlockId,
                                      long knowledgeBlockVersion, long baseVersion, String contentHash,
                                      UUID reviewId, ReviewRating rating, Integer durationSeconds) { }
    private record OfflineCommandFingerprint(String action, UUID clientCommandId, UUID knowledgeBlockId,
                                             long knowledgeBlockVersion, long baseVersion, String contentHash,
                                             UUID reviewId, ReviewRating rating, Integer durationSeconds,
                                             Instant occurredAt, Boolean expectedStateAbsent) { }
    private record LifecycleSnapshot(boolean exists, double difficulty, double stability, Instant dueAt,
                                     Instant lastReviewedAt, int reps, int lapses, boolean needsLearning,
                                     boolean mastered, int stableSuccessCount, String nextReviewStage,
                                     Instant lastPracticeAt, UUID lastReviewId, UUID pendingReviewId,
                                     String contentHash) { }
}
