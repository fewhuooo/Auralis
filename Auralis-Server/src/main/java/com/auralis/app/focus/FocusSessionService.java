package com.auralis.app.focus;

import com.auralis.app.focus.internal.persistence.FocusSessionEntity;
import com.auralis.app.focus.internal.persistence.FocusSessionRepository;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.task.TaskService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class FocusSessionService {
    private static final Duration FUTURE_TOLERANCE = Duration.ofMinutes(5);

    private final FocusSessionRepository repository;
    private final IdentityService identityService;
    private final TaskService taskService;
    private final Clock clock;

    public FocusSessionService(FocusSessionRepository repository, IdentityService identityService,
                               TaskService taskService, Clock clock) {
        this.repository = repository;
        this.identityService = identityService;
        this.taskService = taskService;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public FocusSessionView record(UUID userId, FocusSessionCommand command) {
        validateTime(command);
        identityService.lockUserForScheduling(userId);
        var existing = repository.findByUserIdAndClientSessionId(userId, command.clientSessionId());
        if (existing.isPresent()) {
            FocusSessionEntity entity = existing.get();
            if (!entity.hasSamePayload(command)) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "Focus session id was already used with a different payload");
            }
            return view(entity);
        }
        if (command.taskId() != null) {
            // Focus time describes an already elapsed interval. Offline uploads must remain
            // valid if the task was completed, cancelled, or deleted before synchronization.
            // Resolve it with owner scope, including soft-deleted rows, so another user's task
            // can never be attached to this user's history.
            if (!taskService.isOwnedTask(userId, command.taskId())) {
                throw new DomainException("RESOURCE_NOT_FOUND", "Task was not found");
            }
        }
        return view(repository.saveAndFlush(new FocusSessionEntity(UUID.randomUUID(), userId, command)));
    }

    private void validateTime(FocusSessionCommand command) {
        if (command == null || command.clientSessionId() == null || command.startedAt() == null
                || command.endedAt() == null || command.completed() == null) {
            throw new DomainException("VALIDATION_FAILED", "Focus session fields are required");
        }
        Instant now = clock.instant();
        if (command.endedAt().isBefore(command.startedAt())
                || command.startedAt().isAfter(now.plus(FUTURE_TOLERANCE))
                || command.endedAt().isAfter(now.plus(FUTURE_TOLERANCE))) {
            throw new DomainException("VALIDATION_FAILED", "Focus session timestamps are outside the allowed range");
        }
        long elapsedSeconds = Duration.between(command.startedAt(), command.endedAt()).getSeconds();
        if (command.durationSeconds() < 0 || command.durationSeconds() > 86400
                || command.durationSeconds() > elapsedSeconds) {
            throw new DomainException("VALIDATION_FAILED", "Focus duration must be nonnegative and no longer than the session interval");
        }
    }

    private FocusSessionView view(FocusSessionEntity entity) {
        return new FocusSessionView(entity.getId(), entity.getClientSessionId(), entity.getTaskId(),
                entity.getStartedAt(), entity.getEndedAt(), entity.getDurationSeconds(), entity.isCompleted(), entity.getCreatedAt());
    }
}
