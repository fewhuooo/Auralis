package com.auralis.app.review;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.review.internal.persistence.ReviewEventEntity;
import com.auralis.app.review.internal.persistence.ReviewEventRepository;
import com.auralis.app.review.internal.persistence.ReviewParameterSetEntity;
import com.auralis.app.review.internal.persistence.ReviewParameterSetRepository;
import com.auralis.app.review.internal.persistence.ReviewStateEntity;
import com.auralis.app.review.internal.persistence.ReviewStateRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.domain.ReviewChangedEvent;
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
    private final ReviewParameterSetRepository parameterSetRepository;
    private final KnowledgeBlockService knowledgeBlockService;
    private final ReviewScheduler scheduler;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;

    public ReviewService(ReviewStateRepository stateRepository,
                         ReviewEventRepository eventRepository,
                         ReviewParameterSetRepository parameterSetRepository,
                         KnowledgeBlockService knowledgeBlockService,
                         ReviewScheduler scheduler,
                         ObjectMapper objectMapper,
                         ApplicationEventPublisher eventPublisher) {
        this.stateRepository = stateRepository;
        this.eventRepository = eventRepository;
        this.parameterSetRepository = parameterSetRepository;
        this.knowledgeBlockService = knowledgeBlockService;
        this.scheduler = scheduler;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
    }

    public ReviewStateView preview(UUID userId, UUID knowledgeBlockId, ReviewRating rating, Instant reviewedAt) {
        knowledgeBlockService.get(userId, knowledgeBlockId);
        if (rating == ReviewRating.SKIP) {
            return null;
        }
        var result = scheduler.schedule(null, rating, reviewedAt);
        return new ReviewStateView(
                UUID.nameUUIDFromBytes((userId + ":" + knowledgeBlockId).getBytes(StandardCharsets.UTF_8)),
                userId, knowledgeBlockId, DEFAULT_PARAMETER_ID, result.difficulty(), result.stability(),
                result.dueAt(), reviewedAt, result.reps(), result.lapses(), 0L, reviewedAt, reviewedAt);
    }

    @Transactional
    public ReviewResult record(UUID userId, ReviewEventCommand command) {
        validate(command);
        Instant reviewedAt = command.reviewedAt().truncatedTo(ChronoUnit.MICROS);
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
        knowledgeBlockService.get(userId, command.knowledgeBlockId());
        ReviewParameterSetEntity parameterSet = ensureParameterSet();
        ReviewStateEntity current = stateRepository.findByUserIdAndKnowledgeBlockId(userId, command.knowledgeBlockId())
                .orElse(null);
        if (current != null && current.getVersion() != command.baseVersion()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Review state version does not match", view(current));
        }
        if (current == null && command.baseVersion() != 0) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Review state version does not match");
        }

        ReviewStateView beforeView = current == null ? null : view(current);
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
            saved = stateRepository.saveAndFlush(current);
        }
        ReviewStateView afterView = saved == null ? null : view(saved);
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
        return stateRepository.findTop200ByUserIdAndDueAtLessThanEqualOrderByDueAtAscIdAsc(userId, at).stream()
                .filter(state -> isActiveBlock(userId, state.getKnowledgeBlockId()))
                .limit(limit)
                .map(this::view)
                .toList();
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
        } catch (JsonProcessingException exception) {
            throw new DomainException("INTERNAL_ERROR", "Review state snapshot could not be serialized");
        }
    }

    private ReviewStateView replayState(ReviewEventEntity event, UUID userId) {
        if (event.getAfterState() == null) {
            return null;
        }
        try {
            return objectMapper.readValue(event.getAfterState(), ReviewStateView.class);
        } catch (JsonProcessingException exception) {
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
        return new ReviewStateView(entity.getId(), entity.getUserId(), entity.getKnowledgeBlockId(),
                entity.getParameterSetId(), entity.getDifficulty(), entity.getStability(), entity.getDueAt(),
                entity.getLastReviewedAt(), entity.getReps(), entity.getLapses(), entity.getVersion(),
                entity.getCreatedAt(), entity.getUpdatedAt());
    }

    private ReviewEventView view(ReviewEventEntity entity) {
        return new ReviewEventView(entity.getId(), entity.getUserId(), entity.getKnowledgeBlockId(),
                entity.getClientEventId(), entity.getRating(), entity.getReviewedAt(), entity.getDurationSeconds(),
                entity.getBaseVersion(), entity.getScheduler(), entity.getSchedulerVersion(),
                entity.getParameterSetId(), entity.getCreatedAt());
    }
}
