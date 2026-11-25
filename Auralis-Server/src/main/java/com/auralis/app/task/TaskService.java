package com.auralis.app.task;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.domain.CoreResourceInsert;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.subject.SubjectLockCoordinator;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import com.auralis.app.task.internal.persistence.TaskEntity;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final CoreResourceInsert resourceInsert;
    private final SubjectLockCoordinator subjectLockCoordinator;
    private final IdentityService identityService;
    private final ApplicationEventPublisher eventPublisher;

    public TaskService(
            TaskRepository taskRepository,
            CoreResourceInsert resourceInsert,
            SubjectLockCoordinator subjectLockCoordinator,
            IdentityService identityService,
            ApplicationEventPublisher eventPublisher) {
        this.taskRepository = taskRepository;
        this.resourceInsert = resourceInsert;
        this.subjectLockCoordinator = subjectLockCoordinator;
        this.identityService = identityService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public TaskView create(UUID userId, TaskCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public TaskView create(UUID userId, UUID taskId, TaskCommand command) {
        identityService.lockUserForScheduling(userId);
        subjectLockCoordinator.lockSubjects(userId, List.of(command.subjectId()));
        validateTaskCommand(command);
        validateScheduleDeadlines(List.of(candidate(command)));
        validateScheduleIntervals(userId, List.of(candidate(command)), Set.of());
        TaskEntity entity = new TaskEntity(
                taskId, userId, command.subjectId(), required(command.title()), command.description(),
                status(command.status()), command.scheduledAt(), command.dueAt(), command.durationMinutes(),
                defaultSortKey(command.sortKey()));
        TaskView result = view(resourceInsert.insert("tasks", entity));
        publishChange(userId, result, "CREATE");
        return result;
    }

    @Transactional(readOnly = true)
    public CursorPage<TaskView> list(UUID userId, String encodedCursor, int requestedLimit) {
        int limit = pageLimit(requestedLimit);
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode("tasks", encodedCursor);
        var rows = cursor == null
                ? taskRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
                        userId, PageRequest.of(0, limit + 1))
                : taskRepository.findPageAfter(
                        userId, cursor.updatedAt(), cursor.id(), PageRequest.of(0, limit + 1));
        boolean hasMore = rows.size() > limit;
        var page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode("tasks", "", page.getLast().getUpdatedAt(), page.getLast().getId())
                : null;
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<TaskView> listIncludingDeleted(UUID userId) {
        return taskRepository.findAllByUserIdOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public TaskView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional
    public TaskView requireActiveTaskForMutation(UUID userId, UUID id) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        return view(activeForUpdate(userId, id));
    }

    /** Revalidates a Task after the caller has acquired all owner Subject locks. */
    public TaskView requireActiveTaskForMutation(UUID userId, UUID id, UUID expectedSubjectId) {
        TaskEntity task = activeForUpdate(userId, id);
        if (!expectedSubjectId.equals(task.getSubjectId())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Task subject changed while being validated");
        }
        return view(task);
    }

    @Transactional(readOnly = true)
    public UUID ownerSubjectIdForMutation(UUID userId, UUID id) {
        return taskRepository.findSubjectIdByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
    }

    @Transactional(readOnly = true)
    public boolean isOwnedTask(UUID userId, UUID id) {
        return taskRepository.findByIdAndUserId(id, userId).isPresent();
    }

    @Transactional(noRollbackFor = DomainException.class)
    public TaskView update(UUID userId, UUID id, long baseVersion, TaskCommand command) {
        UUID currentSubjectId = ownerSubjectIdForMutation(userId, id);
        identityService.lockUserForScheduling(userId);
        List<UUID> ownerSubjectIds = new ArrayList<>();
        ownerSubjectIds.add(currentSubjectId);
        ownerSubjectIds.add(command.subjectId());
        subjectLockCoordinator.lockSubjects(userId, ownerSubjectIds);
        TaskEntity entity = activeForUpdate(userId, id);
        if (!entity.getSubjectId().equals(currentSubjectId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Task subject changed while being updated");
        }
        requireVersion(entity, baseVersion);
        validateTaskCommand(command);
        if (scheduleDeadlineFieldsChanged(entity, command)
                || entity.getStatus() == TaskStatus.CANCELLED
                        && status(command.status()) != TaskStatus.CANCELLED
                        && command.scheduledAt() != null) {
            validateScheduleDeadlines(List.of(candidate(command)));
        }
        validateScheduleIntervals(userId, List.of(candidate(command)), Set.of(id));
        entity.update(command.subjectId(), required(command.title()), command.description(), status(command.status()),
                command.scheduledAt(), command.dueAt(), command.durationMinutes(),
                defaultSortKey(command.sortKey()));
        TaskView result = view(taskRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return result;
    }

    /**
     * Exchanges two occupied time slots in one transaction. Both entity locks are
     * acquired in a stable order, so a competing exchange cannot expose a
     * half-completed schedule to callers.
     */
    @Transactional(noRollbackFor = DomainException.class)
    public ScheduleSwapResult swapSchedules(
            UUID userId,
            UUID sourceTaskId,
            long sourceBaseVersion,
            UUID targetTaskId,
            long targetBaseVersion) {
        if (sourceTaskId.equals(targetTaskId)) {
            throw new DomainException("VALIDATION_FAILED", "A task cannot be swapped with itself");
        }

        UUID sourceSubjectId = ownerSubjectIdForMutation(userId, sourceTaskId);
        UUID targetSubjectId = ownerSubjectIdForMutation(userId, targetTaskId);
        identityService.lockUserForScheduling(userId);
        subjectLockCoordinator.lockSubjects(userId, List.of(sourceSubjectId, targetSubjectId));

        TaskEntity[] locked = lockActivePair(userId, sourceTaskId, targetTaskId);
        TaskEntity source = locked[0];
        TaskEntity target = locked[1];
        if (!source.getSubjectId().equals(sourceSubjectId) || !target.getSubjectId().equals(targetSubjectId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Task subject changed while being swapped");
        }
        requireVersion(source, sourceBaseVersion);
        requireVersion(target, targetBaseVersion);
        if (source.getStatus() == TaskStatus.DONE || source.getStatus() == TaskStatus.CANCELLED
                || target.getStatus() == TaskStatus.DONE || target.getStatus() == TaskStatus.CANCELLED) {
            throw new DomainException("VALIDATION_FAILED", "Completed or cancelled tasks cannot be rescheduled");
        }

        Instant sourceSchedule = source.getScheduledAt();
        Instant targetSchedule = target.getScheduledAt();
        if (sourceSchedule == null || targetSchedule == null) {
            throw new DomainException("VALIDATION_FAILED", "Both tasks must be scheduled before they can be swapped");
        }
        Instant newSourceSchedule = targetSchedule;
        Instant newTargetSchedule = sourceSchedule;
        int sourceDuration = effectiveDurationMinutes(source.getDurationMinutes());
        int targetDuration = effectiveDurationMinutes(target.getDurationMinutes());
        boolean sourceImmediatelyBeforeTarget = sourceDuration > 0
                && sourceSchedule.plus(Duration.ofMinutes(sourceDuration)).equals(targetSchedule);
        boolean targetImmediatelyBeforeSource = targetDuration > 0
                && targetSchedule.plus(Duration.ofMinutes(targetDuration)).equals(sourceSchedule);
        if (sourceImmediatelyBeforeTarget || targetImmediatelyBeforeSource) {
            Instant windowStart = sourceImmediatelyBeforeTarget ? sourceSchedule : targetSchedule;
            if (sourceImmediatelyBeforeTarget) {
                newTargetSchedule = windowStart;
                newSourceSchedule = windowStart.plus(Duration.ofMinutes(targetDuration));
            } else {
                newSourceSchedule = windowStart;
                newTargetSchedule = windowStart.plus(Duration.ofMinutes(sourceDuration));
            }
        }
        validateScheduleIntervals(userId, List.of(
                new ScheduleCandidate(newSourceSchedule, source.getDueAt(), source.getDurationMinutes(), source.getStatus()),
                new ScheduleCandidate(newTargetSchedule, target.getDueAt(), target.getDurationMinutes(), target.getStatus())),
                Set.of(sourceTaskId, targetTaskId));
        validateScheduleDeadlines(List.of(
                new ScheduleCandidate(newSourceSchedule, source.getDueAt(), source.getDurationMinutes(), source.getStatus()),
                new ScheduleCandidate(newTargetSchedule, target.getDueAt(), target.getDurationMinutes(), target.getStatus())));

        source.reschedule(newSourceSchedule);
        target.reschedule(newTargetSchedule);
        taskRepository.saveAndFlush(source);
        taskRepository.saveAndFlush(target);

        TaskView sourceView = view(source);
        TaskView targetView = view(target);
        publishChange(userId, sourceView, "UPDATE");
        publishChange(userId, targetView, "UPDATE");
        return new ScheduleSwapResult(sourceView, targetView);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public List<TaskView> insertSchedule(
            UUID userId,
            UUID taskId,
            long baseVersion,
            Instant requestedAt,
            Instant windowStartAt,
            Instant windowLastStartAt) {
        return insertSchedule(userId, taskId, baseVersion, requestedAt, windowStartAt, windowLastStartAt, null);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public List<TaskView> insertSchedule(
            UUID userId,
            UUID taskId,
            long baseVersion,
            Instant requestedAt,
            Instant windowStartAt,
            Instant windowLastStartAt,
            UUID targetTaskId) {
        return insertSchedule(userId, new TaskDtos.ScheduleInsertionRequest(
                taskId, baseVersion, requestedAt, windowStartAt, windowLastStartAt, targetTaskId, null));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public List<TaskView> insertSchedule(UUID userId, TaskDtos.ScheduleInsertionRequest request) {
        UUID taskId = request.taskId();
        UUID targetTaskId = request.targetTaskId();
        Instant requestedAt = request.scheduledAt();
        Instant windowStartAt = request.windowStartAt();
        Instant windowLastStartAt = request.windowLastStartAt();
        boolean strictPlacement = request.strictPlacement();
        if (request.placementMode() != null && !strictPlacement) {
            throw new DomainException("VALIDATION_FAILED", "Unknown schedule placement mode");
        }
        if (strictPlacement && targetTaskId != null) {
            throw new DomainException("VALIDATION_FAILED", "Strict placement cannot specify a target task");
        }
        if (requestedAt == null || windowStartAt == null || windowLastStartAt == null
                || !Duration.between(windowStartAt, windowLastStartAt).equals(Duration.ofMinutes(14 * 60 + 30))) {
            throw new DomainException("VALIDATION_FAILED", "A valid schedule window is required");
        }
        UUID targetSubjectId = ownerSubjectIdForMutation(userId, taskId);
        UUID bodyTargetSubjectId = targetTaskId == null ? null : ownerSubjectIdForMutation(userId, targetTaskId);
        identityService.lockUserForScheduling(userId);

        List<TaskEntity> discovered = taskRepository
                .findAllByUserIdAndDeletedAtIsNullAndScheduledAtIsNotNullOrderByIdAsc(userId);
        Set<UUID> subjectIds = new HashSet<>();
        subjectIds.add(targetSubjectId);
        if (bodyTargetSubjectId != null) {
            subjectIds.add(bodyTargetSubjectId);
        }
        discovered.stream().map(TaskEntity::getSubjectId).forEach(subjectIds::add);
        subjectLockCoordinator.lockSubjects(userId, subjectIds);

        List<TaskEntity> locked = taskRepository.findScheduleForUpdateByUserId(userId, taskId);
        TaskEntity inserted = locked.stream().filter(task -> task.getId().equals(taskId)).findFirst()
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
        if (!inserted.getSubjectId().equals(targetSubjectId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Task subject changed while being scheduled");
        }
        requireVersion(inserted, request.baseVersion());
        if (inserted.getStatus() == TaskStatus.DONE || inserted.getStatus() == TaskStatus.CANCELLED) {
            throw new DomainException("VALIDATION_FAILED", "Completed or cancelled tasks cannot be rescheduled");
        }

        Instant roundedTarget = ceilToSlot(requestedAt, windowStartAt);
        if (requestedAt.isBefore(windowStartAt) || requestedAt.isAfter(windowLastStartAt)
                || roundedTarget.isAfter(windowLastStartAt)) {
            throw new DomainException("VALIDATION_FAILED", "The requested schedule is outside the available window");
        }

        if (strictPlacement) {
            if (!requestedAt.equals(roundedTarget)) {
                throw new DomainException("VALIDATION_FAILED", "Strict placement requires an exact half-hour slot");
            }
            return placeSingleTask(userId, inserted, requestedAt);
        }

        if (targetTaskId != null) {
            TaskEntity bodyTarget = locked.stream().filter(task -> task.getId().equals(targetTaskId)).findFirst()
                    .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Target task was not found"));
            if (!bodyTarget.getSubjectId().equals(bodyTargetSubjectId)) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "Target task subject changed while being scheduled");
            }
            if (targetTaskId.equals(taskId)) {
                throw new DomainException("VALIDATION_FAILED", "A task cannot be inserted into itself");
            }
            if (bodyTarget.getStatus() == TaskStatus.DONE || bodyTarget.getStatus() == TaskStatus.CANCELLED
                    || bodyTarget.getScheduledAt() == null) {
                throw new DomainException("VALIDATION_FAILED", "The target task is not an active scheduled task");
            }
            Instant targetStart = bodyTarget.getScheduledAt();
            if (targetStart.isBefore(windowStartAt) || targetStart.isAfter(windowLastStartAt)) {
                throw new DomainException("VALIDATION_FAILED", "The target task is outside the available window");
            }
            Instant targetEnd = targetStart.plus(
                    Duration.ofMinutes(effectiveDurationMinutes(bodyTarget.getDurationMinutes())));
            Instant afterTarget = ceilToSlot(targetEnd, windowStartAt);
            if (afterTarget.isAfter(windowLastStartAt)) {
                throw new DomainException("VALIDATION_FAILED", "The target task leaves no available following slot");
            }
            if (!requestedAt.equals(afterTarget)) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "The target task changed while being scheduled");
            }

            return placeSingleTask(userId, inserted, afterTarget);
        }

        if (effectiveDurationMinutes(inserted.getDurationMinutes()) == 0) {
            return placeSingleTask(userId, inserted, roundedTarget);
        }
        List<TaskEntity> ordered = locked.stream()
                .filter(task -> task.getId().equals(taskId)
                        || task.getStatus() != TaskStatus.CANCELLED
                        && effectiveDurationMinutes(task.getDurationMinutes()) > 0
                        && task.getScheduledAt() != null
                        && !task.getScheduledAt().isBefore(windowStartAt)
                        && !task.getScheduledAt().isAfter(windowLastStartAt))
                .sorted(Comparator
                        .comparingInt((TaskEntity task) -> task.getId().equals(taskId) ? 1
                                : task.getScheduledAt().plus(Duration.ofMinutes(
                                        effectiveDurationMinutes(task.getDurationMinutes())))
                                        .isAfter(roundedTarget) ? 2 : 0)
                        .thenComparing(task -> task.getId().equals(taskId) ? roundedTarget : task.getScheduledAt())
                        .thenComparing(TaskEntity::getId))
                .toList();

        Instant previousEnd = null;
        List<TaskEntity> changed = new ArrayList<>();
        java.util.Map<UUID, Instant> proposedStarts = new java.util.LinkedHashMap<>();
        for (TaskEntity task : ordered) {
            Instant proposedStart = task.getId().equals(taskId) ? roundedTarget : task.getScheduledAt();
            Instant actualStart = proposedStart;
            if (previousEnd != null && proposedStart.isBefore(previousEnd)) {
                if (task.getStatus() == TaskStatus.DONE) {
                    throw scheduleConflict();
                }
                actualStart = ceilToSlot(previousEnd, windowStartAt);
            }
            if (actualStart.isAfter(windowLastStartAt)) {
                throw new DomainException("VALIDATION_FAILED", "Rescheduled tasks exceed the available window");
            }
            if (!actualStart.equals(task.getScheduledAt())) {
                changed.add(task);
                proposedStarts.put(task.getId(), actualStart);
            }
            previousEnd = actualStart.plus(Duration.ofMinutes(effectiveDurationMinutes(task.getDurationMinutes())));
        }

        if (changed.isEmpty()) {
            return List.of();
        }
        validateScheduleIntervals(userId, changed.stream()
                .map(task -> new ScheduleCandidate(proposedStarts.get(task.getId()), task.getDueAt(),
                        task.getDurationMinutes(), task.getStatus()))
                .toList(), changed.stream().map(TaskEntity::getId).collect(java.util.stream.Collectors.toSet()));
        validateScheduleDeadlines(changed.stream()
                .map(task -> new ScheduleCandidate(proposedStarts.get(task.getId()), task.getDueAt(),
                        task.getDurationMinutes(), task.getStatus()))
                .toList());

        List<TaskView> results = new ArrayList<>(changed.size());
        for (TaskEntity task : changed) {
            task.reschedule(proposedStarts.get(task.getId()));
            results.add(view(taskRepository.saveAndFlush(task)));
        }
        results.sort(Comparator.comparing(TaskView::scheduledAt).thenComparing(TaskView::id));
        results.forEach(result -> publishChange(userId, result, "UPDATE"));
        return List.copyOf(results);
    }

    private List<TaskView> placeSingleTask(UUID userId, TaskEntity source, Instant scheduledAt) {
        ScheduleCandidate proposed = new ScheduleCandidate(
                scheduledAt, source.getDueAt(), source.getDurationMinutes(), source.getStatus());
        validateScheduleIntervals(userId, List.of(proposed), Set.of(source.getId()));
        if (scheduledAt.equals(source.getScheduledAt())) {
            return List.of();
        }
        validateScheduleDeadlines(List.of(proposed));
        source.reschedule(scheduledAt);
        TaskView result = view(taskRepository.saveAndFlush(source));
        publishChange(userId, result, "UPDATE");
        return List.of(result);
    }

    @Transactional(readOnly = true)
    public List<TaskView> currentInsertionSchedule(
            UUID userId, UUID taskId, Instant windowStartAt, Instant windowLastStartAt) {
        List<TaskView> result = new ArrayList<>();
        if (windowStartAt != null && windowLastStartAt != null) {
            taskRepository.findAllByUserIdAndDeletedAtIsNullAndScheduledAtIsNotNullOrderByIdAsc(userId).stream()
                    .filter(task -> !task.getScheduledAt().isBefore(windowStartAt)
                            && !task.getScheduledAt().isAfter(windowLastStartAt))
                    .map(this::view)
                    .forEach(result::add);
        }
        taskRepository.findByIdAndUserIdAndDeletedAtIsNull(taskId, userId)
                .map(this::view)
                .filter(task -> result.stream().noneMatch(existing -> existing.id().equals(task.id())))
                .ifPresent(result::add);
        result.sort(Comparator.comparing(TaskView::scheduledAt,
                Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(TaskView::id));
        return List.copyOf(result);
    }

    @Transactional(readOnly = true)
    public List<TaskView> currentSwapSchedule(UUID userId, UUID sourceTaskId, UUID targetTaskId) {
        List<TaskView> result = new ArrayList<>();
        if (sourceTaskId != null) {
            taskRepository.findByIdAndUserIdAndDeletedAtIsNull(sourceTaskId, userId)
                    .map(this::view).ifPresent(result::add);
        }
        if (targetTaskId != null && !targetTaskId.equals(sourceTaskId)) {
            taskRepository.findByIdAndUserIdAndDeletedAtIsNull(targetTaskId, userId)
                    .map(this::view).ifPresent(result::add);
        }
        return List.copyOf(result);
    }

    private Instant ceilToSlot(Instant instant, Instant windowStartAt) {
        Duration offset = Duration.between(windowStartAt, instant);
        long seconds = offset.getSeconds();
        long remainder = Math.floorMod(seconds, 30 * 60L);
        if (remainder == 0 && offset.getNano() == 0) {
            return instant;
        }
        long slots = Math.floorDiv(seconds, 30 * 60L) + 1;
        return windowStartAt.plusSeconds(slots * 30 * 60L);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        TaskEntity entity = activeForUpdate(userId, id);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        taskRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
        eventPublisher.publishEvent(new ResourceDeletedEvent(userId, ResourceType.TASK, id));
    }

    @EventListener
    @Transactional
    public void onSubjectDeleted(ResourceDeletedEvent event) {
        if (event.resourceType() != ResourceType.SUBJECT) {
            return;
        }
        taskRepository.findAllForUpdateByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
                        event.userId(), event.resourceId())
                .forEach(task -> {
                    task.softDelete();
                    TaskView result = view(taskRepository.saveAndFlush(task));
                    publishChange(event.userId(), result, "DELETE");
                    eventPublisher.publishEvent(new ResourceDeletedEvent(
                            event.userId(), ResourceType.TASK, task.getId()));
                });
    }

    @Transactional(noRollbackFor = DomainException.class)
    public TaskView restore(UUID userId, UUID id, long baseVersion) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        identityService.lockUserForScheduling(userId);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        TaskEntity entity = taskRepository.findForUpdate(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
        if (!entity.getSubjectId().equals(subjectId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Task subject changed while being restored");
        }
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Task is not deleted");
        }
        requireVersion(entity, baseVersion);
        validateScheduleIntervals(userId, List.of(new ScheduleCandidate(
                entity.getScheduledAt(), entity.getDueAt(), entity.getDurationMinutes(), entity.getStatus())), Set.of(id));
        validateScheduleDeadlines(List.of(new ScheduleCandidate(
                entity.getScheduledAt(), entity.getDueAt(), entity.getDurationMinutes(), entity.getStatus())));
        entity.restore();
        TaskView result = view(taskRepository.saveAndFlush(entity));
        publishChange(userId, result, "RESTORE");
        return result;
    }

    private TaskEntity active(UUID userId, UUID id) {
        return taskRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
    }

    private TaskEntity activeForUpdate(UUID userId, UUID id) {
        return taskRepository.findActiveForUpdate(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
    }

    private TaskEntity[] lockActivePair(UUID userId, UUID sourceTaskId, UUID targetTaskId) {
        boolean sourceFirst = sourceTaskId.toString().compareTo(targetTaskId.toString()) < 0;
        TaskEntity first = activeForUpdate(userId, sourceFirst ? sourceTaskId : targetTaskId);
        TaskEntity second = activeForUpdate(userId, sourceFirst ? targetTaskId : sourceTaskId);
        return sourceFirst ? new TaskEntity[] { first, second } : new TaskEntity[] { second, first };
    }

    private void requireActive(TaskEntity entity) {
        if (entity.getDeletedAt() != null) {
            throw new DomainException("RESOURCE_DELETED", "Task has been deleted");
        }
    }

    private void requireVersion(TaskEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Task version does not match", view(entity));
        }
    }

    private String required(String title) {
        if (title == null || title.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "title is required");
        }
        return title.trim();
    }

    private TaskStatus status(TaskStatus status) {
        return status == null ? TaskStatus.TODO : status;
    }

    private String defaultSortKey(String sortKey) {
        return sortKey == null ? "" : sortKey;
    }

    private void validateTaskCommand(TaskCommand command) {
        if (command.durationMinutes() != null && command.durationMinutes() < 0) {
            throw new DomainException("VALIDATION_FAILED", "durationMinutes cannot be negative");
        }
    }

    private ScheduleCandidate candidate(TaskCommand command) {
        return new ScheduleCandidate(command.scheduledAt(), command.dueAt(), command.durationMinutes(), status(command.status()));
    }

    private boolean scheduleDeadlineFieldsChanged(TaskEntity entity, TaskCommand command) {
        return !Objects.equals(entity.getScheduledAt(), command.scheduledAt())
                || !Objects.equals(entity.getDueAt(), command.dueAt())
                || effectiveDurationMinutes(entity.getDurationMinutes())
                        != effectiveDurationMinutes(command.durationMinutes());
    }

    private void validateScheduleDeadlines(List<ScheduleCandidate> candidates) {
        for (ScheduleCandidate candidate : candidates) {
            if (candidate.scheduledAt() == null || candidate.dueAt() == null) {
                continue;
            }
            Instant scheduledEnd = candidate.scheduledAt().plus(
                    Duration.ofMinutes(effectiveDurationMinutes(candidate.durationMinutes())));
            if (scheduledEnd.isAfter(candidate.dueAt())) {
                throw new DomainException("VALIDATION_FAILED", "Task schedule must end on or before its deadline");
            }
        }
    }

    private void validateScheduleIntervals(
            UUID userId, List<ScheduleCandidate> candidates, Set<UUID> excludedTaskIds) {
        List<ScheduleCandidate> proposed = candidates.stream()
                .filter(candidate -> candidate.scheduledAt() != null)
                .filter(candidate -> candidate.status() != TaskStatus.CANCELLED)
                .toList();
        if (proposed.isEmpty()) {
            return;
        }

        List<TaskEntity> existing = taskRepository.findAllByUserIdAndDeletedAtIsNullAndScheduledAtIsNotNull(userId);
        for (ScheduleCandidate candidate : proposed) {
            for (TaskEntity task : existing) {
                if (excludedTaskIds.contains(task.getId()) || task.getStatus() == TaskStatus.CANCELLED) {
                    continue;
                }
                if (overlaps(candidate, new ScheduleCandidate(
                        task.getScheduledAt(), task.getDueAt(), task.getDurationMinutes(), task.getStatus()))) {
                    throw scheduleConflict();
                }
            }
        }

        for (int i = 0; i < proposed.size(); i++) {
            for (int j = i + 1; j < proposed.size(); j++) {
                if (overlaps(proposed.get(i), proposed.get(j))) {
                    throw scheduleConflict();
                }
            }
        }
    }

    private boolean overlaps(ScheduleCandidate left, ScheduleCandidate right) {
        Instant leftStart = left.scheduledAt();
        Instant rightStart = right.scheduledAt();
        Instant leftEnd = leftStart.plus(Duration.ofMinutes(effectiveDurationMinutes(left.durationMinutes())));
        Instant rightEnd = rightStart.plus(Duration.ofMinutes(effectiveDurationMinutes(right.durationMinutes())));
        return leftStart.isBefore(leftEnd) && rightStart.isBefore(rightEnd)
                && leftStart.isBefore(rightEnd) && rightStart.isBefore(leftEnd);
    }

    private int effectiveDurationMinutes(Integer durationMinutes) {
        return durationMinutes == null ? 30 : durationMinutes;
    }

    private DomainException scheduleConflict() {
        return new DomainException("VALIDATION_FAILED", "Task schedule overlaps another active task");
    }

    private record ScheduleCandidate(Instant scheduledAt, Instant dueAt, Integer durationMinutes, TaskStatus status) {
    }

    private TaskView view(TaskEntity entity) {
        return new TaskView(
                entity.getId(), entity.getSubjectId(), entity.getTitle(), entity.getDescription(), entity.getStatus(),
                entity.getScheduledAt(), entity.getDueAt(), entity.getDurationMinutes(),
                entity.getSortKey(), entity.getVersion(), entity.getCreatedAt(),
                entity.getUpdatedAt(), entity.getDeletedAt());
    }

    private void publishChange(UUID userId, TaskView view, String mutationType) {
        eventPublisher.publishEvent(new ResourceChangedEvent(
                userId, ResourceType.TASK, view.id(), mutationType, view.version(), view.deletedAt(), view));
    }

    private int pageLimit(int requestedLimit) {
        if (requestedLimit < 1 || requestedLimit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
        return requestedLimit;
    }

    public record ScheduleSwapResult(TaskView source, TaskView target) {
    }
}
