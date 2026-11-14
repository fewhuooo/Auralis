package com.auralis.app.sync;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.NullNode;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.relation.RelationCommand;
import com.auralis.app.relation.RelationService;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskDtos;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.TaskView;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.List;
import java.util.Objects;

@Component
public class DomainWritePort {

    private final ObjectMapper objectMapper;
    private final SubjectService subjectService;
    private final SourceService sourceService;
    private final KnowledgeBlockService knowledgeBlockService;
    private final TaskService taskService;
    private final RelationService relationService;

    public DomainWritePort(
            ObjectMapper objectMapper,
            SubjectService subjectService,
            SourceService sourceService,
            KnowledgeBlockService knowledgeBlockService,
            TaskService taskService,
            RelationService relationService) {
        this.objectMapper = objectMapper;
        this.subjectService = subjectService;
        this.sourceService = sourceService;
        this.knowledgeBlockService = knowledgeBlockService;
        this.taskService = taskService;
        this.relationService = relationService;
    }

    public Object apply(UUID userId, SyncMutation mutation) {
        JsonNode payload = mutation.payload() == null ? NullNode.getInstance() : mutation.payload();
        return switch (mutation.resourceType()) {
            case SUBJECT -> applySubject(userId, mutation, payload);
            case SOURCE -> applySource(userId, mutation, payload);
            case KNOWLEDGE_BLOCK -> applyKnowledgeBlock(userId, mutation, payload);
            case TASK -> applyTask(userId, mutation, payload);
            case RELATION -> applyRelation(userId, mutation, payload);
        };
    }

    private Object applySubject(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> subjectService.create(userId, mutation.resourceId(), command(payload, SubjectCommand.class));
            case UPDATE -> subjectService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, SubjectCommand.class));
            case DELETE -> { subjectService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> subjectService.restore(userId, mutation.resourceId(), mutation.baseVersion());
            case SCHEDULE_INSERTION, SCHEDULE_SWAP -> throw unsupportedScheduleMutation();
        };
    }

    private Object applySource(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> sourceService.create(userId, mutation.resourceId(), command(payload, SourceCommand.class));
            case UPDATE -> sourceService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, SourceCommand.class));
            case DELETE -> { sourceService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> sourceService.restore(userId, mutation.resourceId(), mutation.baseVersion());
            case SCHEDULE_INSERTION, SCHEDULE_SWAP -> throw unsupportedScheduleMutation();
        };
    }

    private Object applyKnowledgeBlock(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> knowledgeBlockService.create(userId, mutation.resourceId(), command(payload, KnowledgeBlockCommand.class));
            case UPDATE -> knowledgeBlockService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, KnowledgeBlockCommand.class));
            case DELETE -> { knowledgeBlockService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> knowledgeBlockService.restore(userId, mutation.resourceId(), mutation.baseVersion());
            case SCHEDULE_INSERTION, SCHEDULE_SWAP -> throw unsupportedScheduleMutation();
        };
    }

    private Object applyTask(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> taskService.create(userId, mutation.resourceId(), command(payload, TaskCommand.class));
            case UPDATE -> taskService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, TaskCommand.class));
            case DELETE -> { taskService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> taskService.restore(userId, mutation.resourceId(), mutation.baseVersion());
            case SCHEDULE_INSERTION, SCHEDULE_SWAP -> applyTaskSchedule(userId, mutation, payload);
        };
    }

    private Object applyRelation(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> relationService.create(userId, mutation.resourceId(), command(payload, RelationCommand.class));
            case UPDATE -> relationService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, RelationCommand.class));
            case DELETE -> { relationService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> relationService.restore(userId, mutation.resourceId(), mutation.baseVersion());
            case SCHEDULE_INSERTION, SCHEDULE_SWAP -> throw unsupportedScheduleMutation();
        };
    }

    public List<TaskView> applyTaskSchedule(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case SCHEDULE_INSERTION -> {
                TaskDtos.ScheduleInsertionRequest request = command(payload, TaskDtos.ScheduleInsertionRequest.class);
                validateScheduleEnvelope(mutation, request.taskId(), request.baseVersion());
                yield taskService.insertSchedule(userId, request);
            }
            case SCHEDULE_SWAP -> {
                TaskDtos.ScheduleSwapRequest request = command(payload, TaskDtos.ScheduleSwapRequest.class);
                validateScheduleEnvelope(mutation, request.sourceTaskId(), request.sourceBaseVersion());
                validateScheduleSwapTarget(request.targetTaskId(), request.targetBaseVersion());
                TaskService.ScheduleSwapResult result = taskService.swapSchedules(
                        userId, request.sourceTaskId(), request.sourceBaseVersion(),
                        request.targetTaskId(), request.targetBaseVersion());
                yield List.of(result.source(), result.target());
            }
            default -> throw unsupportedScheduleMutation();
        };
    }

    public List<TaskView> currentTaskSchedule(UUID userId, SyncMutation mutation) {
        JsonNode payload = mutation.payload() == null ? NullNode.getInstance() : mutation.payload();
        try {
            return switch (mutation.mutationType()) {
                case SCHEDULE_INSERTION -> {
                    TaskDtos.ScheduleInsertionRequest request = command(payload, TaskDtos.ScheduleInsertionRequest.class);
                    validateScheduleEnvelope(mutation, request.taskId(), request.baseVersion());
                    if (request.placementMode() != null) {
                        yield taskService.currentInsertionSchedule(userId, request.taskId(), null, null);
                    }
                    yield taskService.currentInsertionSchedule(userId, request.taskId(),
                            request.windowStartAt(), request.windowLastStartAt());
                }
                case SCHEDULE_SWAP -> {
                    TaskDtos.ScheduleSwapRequest request = command(payload, TaskDtos.ScheduleSwapRequest.class);
                    validateScheduleEnvelope(mutation, request.sourceTaskId(), request.sourceBaseVersion());
                    yield taskService.currentSwapSchedule(userId, request.sourceTaskId(), request.targetTaskId());
                }
                default -> throw unsupportedScheduleMutation();
            };
        } catch (DomainException exception) {
            if (mutation.mutationType() == SyncMutationType.SCHEDULE_INSERTION) {
                return taskService.currentInsertionSchedule(userId, mutation.resourceId(), null, null);
            }
            if (mutation.mutationType() == SyncMutationType.SCHEDULE_SWAP) {
                return taskService.currentSwapSchedule(userId, mutation.resourceId(), null);
            }
            throw exception;
        }
    }

    private DomainException unsupportedScheduleMutation() {
        return new DomainException("VALIDATION_FAILED", "Schedule mutations are only supported for tasks");
    }

    private void validateScheduleEnvelope(SyncMutation mutation, UUID payloadTaskId, Long payloadBaseVersion) {
        if (!Objects.equals(mutation.resourceId(), payloadTaskId)
                || payloadBaseVersion == null || payloadBaseVersion.longValue() != mutation.baseVersion()) {
            throw new DomainException("VALIDATION_FAILED", "Schedule mutation identity does not match its payload");
        }
    }

    private void validateScheduleSwapTarget(UUID targetTaskId, Long targetBaseVersion) {
        if (targetTaskId == null || targetBaseVersion == null) {
            throw new DomainException("VALIDATION_FAILED", "Schedule swap target identity and version are required");
        }
    }

    private <T> T command(JsonNode payload, Class<T> type) {
        try {
            T result = objectMapper.treeToValue(payload, type);
            if (result == null) {
                throw new DomainException("VALIDATION_FAILED", "Mutation payload is invalid");
            }
            return result;
        } catch (JacksonException exception) {
            throw new DomainException("VALIDATION_FAILED", "Mutation payload is invalid");
        }
    }
}
