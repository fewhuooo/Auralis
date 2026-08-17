package com.auralis.app.task;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import com.auralis.app.task.internal.persistence.TaskEntity;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final SubjectService subjectService;
    private final ApplicationEventPublisher eventPublisher;

    public TaskService(
            TaskRepository taskRepository,
            SubjectService subjectService,
            ApplicationEventPublisher eventPublisher) {
        this.taskRepository = taskRepository;
        this.subjectService = subjectService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public TaskView create(UUID userId, TaskCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public TaskView create(UUID userId, UUID taskId, TaskCommand command) {
        subjectService.requireActiveSubject(userId, command.subjectId());
        validateSchedule(command);
        TaskView result = view(taskRepository.save(new TaskEntity(
                taskId, userId, command.subjectId(), required(command.title()), command.description(),
                status(command.status()), command.scheduledAt(), command.dueAt(), command.durationMinutes(),
                command.cognitiveLoad(), defaultSortKey(command.sortKey()), command.colorOverride())));
        publishChange(userId, result, "CREATE");
        return result;
    }

    @Transactional(readOnly = true)
    public List<TaskView> list(UUID userId) {
        return taskRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
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

    @Transactional(noRollbackFor = DomainException.class)
    public TaskView update(UUID userId, UUID id, long baseVersion, TaskCommand command) {
        TaskEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        subjectService.requireActiveSubject(userId, command.subjectId());
        validateSchedule(command);
        entity.update(command.subjectId(), required(command.title()), command.description(), status(command.status()),
                command.scheduledAt(), command.dueAt(), command.durationMinutes(), command.cognitiveLoad(),
                defaultSortKey(command.sortKey()), command.colorOverride());
        TaskView result = view(taskRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return result;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        TaskEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        taskRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
        eventPublisher.publishEvent(new ResourceDeletedEvent(userId, ResourceType.TASK, id));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public TaskView restore(UUID userId, UUID id, long baseVersion) {
        TaskEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Task is not deleted");
        }
        requireVersion(entity, baseVersion);
        subjectService.requireActiveSubject(userId, entity.getSubjectId());
        entity.restore();
        TaskView result = view(taskRepository.saveAndFlush(entity));
        publishChange(userId, result, "RESTORE");
        return result;
    }

    private TaskEntity active(UUID userId, UUID id) {
        return taskRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
    }

    private TaskEntity mutable(UUID userId, UUID id) {
        return taskRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Task was not found"));
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

    private void validateSchedule(TaskCommand command) {
        if (command.durationMinutes() != null && command.durationMinutes() < 0) {
            throw new DomainException("VALIDATION_FAILED", "durationMinutes cannot be negative");
        }
        if (command.scheduledAt() != null && command.dueAt() != null
                && command.dueAt().isBefore(command.scheduledAt())) {
            throw new DomainException("VALIDATION_FAILED", "dueAt cannot be before scheduledAt");
        }
    }

    private TaskView view(TaskEntity entity) {
        return new TaskView(
                entity.getId(), entity.getSubjectId(), entity.getTitle(), entity.getDescription(), entity.getStatus(),
                entity.getScheduledAt(), entity.getDueAt(), entity.getDurationMinutes(), entity.getCognitiveLoad(),
                entity.getSortKey(), entity.getColorOverride(), entity.getVersion(), entity.getCreatedAt(),
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
}
