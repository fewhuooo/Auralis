package com.auralis.app.review;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.review.internal.persistence.ReviewEventEntity;
import com.auralis.app.review.internal.persistence.ReviewEventRepository;
import com.auralis.app.review.internal.persistence.ReviewLifecycleReviewRepository;
import com.auralis.app.review.internal.persistence.ReviewParameterSetEntity;
import com.auralis.app.review.internal.persistence.ReviewParameterSetRepository;
import com.auralis.app.review.internal.persistence.ReviewStateEntity;
import com.auralis.app.review.internal.persistence.ReviewStateRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.domain.ReviewChangedEvent;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import com.auralis.app.subject.SubjectService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
public class ReviewService {
    public static final String SCHEDULER = "FSRS_LITE";
    public static final int PARAMETER_VERSION = 1;
    private static final UUID DEFAULT_PARAMETER_ID = UUID.nameUUIDFromBytes(
            "auralis-review-fsrs-lite-v1".getBytes(StandardCharsets.UTF_8));
    private static final String DEFAULT_PARAMETERS =
            "{\"againMinutes\":10,\"hardFactor\":1.2,\"goodFactor\":2.0,\"easyFactor\":3.0}";

    private final ReviewStateRepository stateRepository;
    private final ReviewEventRepository eventRepository;
    private final ReviewLifecycleReviewRepository lifecycleReviewRepository;
    private final ReviewParameterSetRepository parameterSetRepository;
    private final KnowledgeBlockService knowledgeBlockService;
    private final ReviewScheduler scheduler;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final SubjectService subjectService;

    public ReviewService(ReviewStateRepository stateRepository,
                         ReviewEventRepository eventRepository,
                         ReviewLifecycleReviewRepository lifecycleReviewRepository,
                         ReviewParameterSetRepository parameterSetRepository,
                         KnowledgeBlockService knowledgeBlockService,
                         ReviewScheduler scheduler,
                         ObjectMapper objectMapper,
                         ApplicationEventPublisher eventPublisher,
                         SubjectService subjectService) {
        this.stateRepository = stateRepository;
        this.eventRepository = eventRepository;
        this.lifecycleReviewRepository = lifecycleReviewRepository;
        this.parameterSetRepository = parameterSetRepository;
        this.knowledgeBlockService = knowledgeBlockService;
        this.scheduler = scheduler;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
        this.subjectService = subjectService;
    }

    public ReviewStateView preview(UUID userId, UUID knowledgeBlockId, ReviewRating rating, Instant reviewedAt) {
        var block = knowledgeBlockService.get(userId, knowledgeBlockId);
        if (rating == ReviewRating.SKIP) {
            return null;
        }
        var result = scheduler.schedule(null, rating, reviewedAt);
        return new ReviewStateView(
                UUID.nameUUIDFromBytes((userId + ":" + knowledgeBlockId).getBytes(StandardCharsets.UTF_8)),
                userId, knowledgeBlockId, DEFAULT_PARAMETER_ID, result.difficulty(), result.stability(),
                result.dueAt(), reviewedAt, result.reps(), result.lapses(), 0L, reviewedAt, reviewedAt,
                block.version(), false, false, 0, null, reviewedAt, null, null,
                ReviewContentHash.sha256(block.content()));
    }

    @Transactional
    public ReviewResult record(UUID userId, ReviewEventCommand command) {
        validate(command);
        Instant reviewedAt = command.reviewedAt().truncatedTo(ChronoUnit.MICROS);
        var block = knowledgeBlockService.requireActiveKnowledgeBlockForMutation(userId, command.knowledgeBlockId());
        var replay = eventRepository.findByUserIdAndClientEventId(userId, command.clientEventId());
        if (replay.isPresent()) {
            ReviewEventEntity event = replay.get();
            if (!event.getKnowledgeBlockId().equals(command.knowledgeBlockId())
                    || event.getRating() != command.rating()
                    || !event.getReviewedAt().equals(reviewedAt)
                    || event.getDurationSeconds() != command.durationSeconds()
                    || event.getBaseVersion() != command.baseVersion()) {
                throw new DomainException("MUTATION_REJECTED", "clientEventId was already used with different content");
            }
            ReviewStateView state = event.getRating() == ReviewRating.SKIP
                    ? null : replayState(event, userId);
            return new ReviewResult(view(event), state);
        }
        ReviewParameterSetEntity parameterSet = ensureParameterSet();
        ReviewStateEntity current = stateRepository.findForUpdateByUserIdAndKnowledgeBlockId(userId, command.knowledgeBlockId())
                .orElse(null);
        if (current != null && current.getVersion() != command.baseVersion()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Review state version does not match", view(current, block.version()));
        }
        if (current == null && command.baseVersion() != 0) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Review state version does not match");
        }

        ReviewStateView beforeView = current == null ? null : view(current, block.version());
        ReviewScheduler.StateSnapshot before = current == null ? null : snapshot(current);
        ReviewScheduler.ScheduledReview next = command.rating() == ReviewRating.SKIP
                ? null : scheduler.schedule(before, command.rating(), reviewedAt);
        ReviewStateEntity saved = null;
        if (next != null) {
            if (current == null) {
                current = new ReviewStateEntity(UUID.randomUUID(), userId, command.knowledgeBlockId(),
                        parameterSet.getId(), next.difficulty(), next.stability(), next.dueAt());
                current.apply(next.difficulty(), next.stability(), next.dueAt(), reviewedAt,
                        next.reps(), next.lapses());
            } else {
                current.apply(next.difficulty(), next.stability(), next.dueAt(), reviewedAt,
                        next.reps(), next.lapses());
            }
            lifecycleReviewRepository.supersedeUnresolved(userId, command.knowledgeBlockId());
            boolean again = command.rating() == ReviewRating.AGAIN;
            boolean hard = command.rating() == ReviewRating.HARD;
            boolean mastered = again || hard ? false : current.isMastered();
            int stable = again || hard ? 0 : current.getStableSuccessCount();
            String nextStage = mastered ? null : again ? "EARLY_RECALL"
                    : stable >= 3 ? "FINAL_VERIFICATION" : "CROSS_DAY";
            current.applyLifecycle(current.getStability(), next.dueAt(), reviewedAt, again, mastered,
                    stable, nextStage,
                    null, null, ReviewContentHash.sha256(block.content()));
            saved = stateRepository.saveAndFlush(current);
        }
        ReviewStateView afterView = saved == null ? null : view(saved, block.version());
        ReviewEventEntity event = new ReviewEventEntity(
                UUID.randomUUID(), userId, command.knowledgeBlockId(), command.clientEventId(), command.rating(),
                reviewedAt, command.durationSeconds(), command.baseVersion(), SCHEDULER,
                PARAMETER_VERSION, parameterSet.getId(), snapshotText(beforeView), snapshotText(afterView));
        eventRepository.save(event);
        eventRepository.flush();
        eventPublisher.publishEvent(new ReviewChangedEvent(
                userId, command.knowledgeBlockId(), afterView == null ? command.baseVersion() : afterView.version(),
                event.getCreatedAt()));
        return new ReviewResult(view(event), afterView);
    }

    @Transactional(readOnly = true)
    public List<ReviewStateView> due(UUID userId, Instant at, int limit) {
        checkLimit(limit);
        return stateRepository.findTop200ByUserIdAndNeedsLearningFalseAndMasteredFalseAndDueAtLessThanEqualOrderByDueAtAscIdAsc(userId, at).stream()
                .filter(state -> isActiveBlock(userId, state.getKnowledgeBlockId()))
                .limit(limit)
                .map(this::view)
                .toList();
    }

    @Transactional(readOnly = true)
    public CursorPage<ReviewStateView> states(UUID userId, UUID subjectId, String encodedCursor, int requestedLimit) {
        checkLimit(requestedLimit);
        subjectService.requireActiveSubject(userId, subjectId);
        String resource = "review-states:" + userId + ":" + subjectId;
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode(resource, encodedCursor);
        if (cursor != null && (!cursor.sortKey().isEmpty() || !Instant.EPOCH.equals(cursor.updatedAt()))) {
            throw new DomainException("VALIDATION_FAILED", "Cursor is invalid");
        }
        UUID afterKnowledgeBlockId = cursor == null ? null : cursor.id();
        List<ReviewStateEntity> rows = stateRepository.findForActiveSubjectAfter(
                userId, subjectId, afterKnowledgeBlockId, requestedLimit + 1);
        boolean hasMore = rows.size() > requestedLimit;
        List<ReviewStateEntity> page = hasMore ? rows.subList(0, requestedLimit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode(resource, "", Instant.EPOCH, page.getLast().getKnowledgeBlockId())
                : null;
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<ReviewEventView> history(UUID userId, UUID knowledgeBlockId) {
        knowledgeBlockService.get(userId, knowledgeBlockId);
        return eventRepository.findAllByUserIdAndKnowledgeBlockIdOrderByReviewedAtAscIdAsc(userId, knowledgeBlockId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public ReviewParameterSetView parameterSet() {
        return view(parameterSetRepository.findBySchedulerAndVersion(SCHEDULER, PARAMETER_VERSION)
                .orElse(new ReviewParameterSetEntity(DEFAULT_PARAMETER_ID, SCHEDULER,
                        PARAMETER_VERSION, DEFAULT_PARAMETERS)));
    }

    private ReviewParameterSetEntity ensureParameterSet() {
        return parameterSetRepository.findBySchedulerAndVersion(SCHEDULER, PARAMETER_VERSION)
                .orElseGet(() -> parameterSetRepository.saveAndFlush(new ReviewParameterSetEntity(
                        DEFAULT_PARAMETER_ID, SCHEDULER, PARAMETER_VERSION, DEFAULT_PARAMETERS)));
    }

    private void validate(ReviewEventCommand command) {
        if (command == null || command.clientEventId() == null || command.knowledgeBlockId() == null
                || command.rating() == null || command.reviewedAt() == null) {
            throw new DomainException("VALIDATION_FAILED", "Review event fields are required");
        }
        if (command.durationSeconds() < 0 || command.baseVersion() < 0) {
            throw new DomainException("VALIDATION_FAILED", "Review event counters must be non-negative");
        }
    }

    private void checkLimit(int limit) {
        if (limit < 1 || limit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
    }

    private boolean isActiveBlock(UUID userId, UUID knowledgeBlockId) {
        try {
            knowledgeBlockService.get(userId, knowledgeBlockId);
            return true;
        } catch (DomainException exception) {
            return false;
        }
    }

    private ReviewScheduler.StateSnapshot snapshot(ReviewStateEntity state) {
        return new ReviewScheduler.StateSnapshot(state.getDifficulty(), state.getStability(),
                state.getReps(), state.getLapses(), state.getDueAt());
    }

    private String snapshotText(ReviewStateView state) {
        if (state == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(state);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Review state snapshot could not be serialized");
        }
    }

    private ReviewStateView replayState(ReviewEventEntity event, UUID userId) {
        if (event.getAfterState() == null) {
            return null;
        }
        try {
            return objectMapper.readValue(event.getAfterState(), ReviewStateView.class);
        } catch (JacksonException exception) {
            return stateRepository.findByUserIdAndKnowledgeBlockId(userId, event.getKnowledgeBlockId())
                    .map(this::view)
                    .orElse(null);
        }
    }

    private ReviewParameterSetView view(ReviewParameterSetEntity entity) {
        return new ReviewParameterSetView(entity.getId(), entity.getScheduler(), entity.getVersion(),
                entity.getParameters(), entity.getCreatedAt());
    }

    private ReviewStateView view(ReviewStateEntity entity) {
        return view(entity, knowledgeBlockService.get(entity.getUserId(), entity.getKnowledgeBlockId()).version());
    }

    private ReviewStateView view(ReviewStateEntity entity, long knowledgeBlockVersion) {
        return new ReviewStateView(entity.getId(), entity.getUserId(), entity.getKnowledgeBlockId(),
                entity.getParameterSetId(), entity.getDifficulty(), entity.getStability(), entity.getDueAt(),
                entity.getLastReviewedAt(), entity.getReps(), entity.getLapses(), entity.getVersion(),
                entity.getCreatedAt(), entity.getUpdatedAt(), knowledgeBlockVersion, entity.isNeedsLearning(),
                entity.isMastered(), entity.getStableSuccessCount(), entity.getNextReviewStage(),
                entity.getLastPracticeAt(), entity.getLastReviewId(), entity.getPendingReviewId(), entity.getContentHash());
    }

    private ReviewEventView view(ReviewEventEntity entity) {
        return new ReviewEventView(entity.getId(), entity.getUserId(), entity.getKnowledgeBlockId(),
                entity.getClientEventId(), entity.getRating(), entity.getReviewedAt(), entity.getDurationSeconds(),
                entity.getBaseVersion(), entity.getScheduler(), entity.getSchedulerVersion(),
                entity.getParameterSetId(), entity.getCreatedAt(), entity.getBeforeState() == null);
    }
}
