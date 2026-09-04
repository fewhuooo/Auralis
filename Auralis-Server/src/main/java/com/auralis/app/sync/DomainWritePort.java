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
import com.auralis.app.task.TaskService;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;

import java.util.UUID;

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
        };
    }

    private Object applySource(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> sourceService.create(userId, mutation.resourceId(), command(payload, SourceCommand.class));
            case UPDATE -> sourceService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, SourceCommand.class));
            case DELETE -> { sourceService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> sourceService.restore(userId, mutation.resourceId(), mutation.baseVersion());
        };
    }

    private Object applyKnowledgeBlock(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> knowledgeBlockService.create(userId, mutation.resourceId(), command(payload, KnowledgeBlockCommand.class));
            case UPDATE -> knowledgeBlockService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, KnowledgeBlockCommand.class));
            case DELETE -> { knowledgeBlockService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> knowledgeBlockService.restore(userId, mutation.resourceId(), mutation.baseVersion());
        };
    }

    private Object applyTask(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> taskService.create(userId, mutation.resourceId(), command(payload, TaskCommand.class));
            case UPDATE -> taskService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, TaskCommand.class));
            case DELETE -> { taskService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> taskService.restore(userId, mutation.resourceId(), mutation.baseVersion());
        };
    }

    private Object applyRelation(UUID userId, SyncMutation mutation, JsonNode payload) {
        return switch (mutation.mutationType()) {
            case CREATE -> relationService.create(userId, mutation.resourceId(), command(payload, RelationCommand.class));
            case UPDATE -> relationService.update(userId, mutation.resourceId(), mutation.baseVersion(), command(payload, RelationCommand.class));
            case DELETE -> { relationService.delete(userId, mutation.resourceId(), mutation.baseVersion()); yield null; }
            case RESTORE -> relationService.restore(userId, mutation.resourceId(), mutation.baseVersion());
        };
    }

    private <T> T command(JsonNode payload, Class<T> type) {
        try {
            return objectMapper.treeToValue(payload, type);
        } catch (JacksonException exception) {
            throw new DomainException("VALIDATION_FAILED", "Mutation payload is invalid");
        }
    }
}
