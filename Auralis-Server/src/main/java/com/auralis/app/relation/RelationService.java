package com.auralis.app.relation;

import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.relation.internal.persistence.RelationEntity;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.relation.internal.persistence.RelationEndpointSnapshot;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.subject.SubjectLockCoordinator;
import com.auralis.app.task.TaskService;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import org.springframework.context.event.EventListener;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class RelationService {

    private final RelationRepository relationRepository;
    private final SubjectLockCoordinator subjectLockCoordinator;
    private final SourceService sourceService;
    private final KnowledgeBlockService knowledgeBlockService;
    private final TaskService taskService;
    private final ApplicationEventPublisher eventPublisher;

    public RelationService(
            RelationRepository relationRepository,
            SubjectLockCoordinator subjectLockCoordinator,
            SourceService sourceService,
            KnowledgeBlockService knowledgeBlockService,
            TaskService taskService,
            ApplicationEventPublisher eventPublisher) {
        this.relationRepository = relationRepository;
        this.subjectLockCoordinator = subjectLockCoordinator;
        this.sourceService = sourceService;
        this.knowledgeBlockService = knowledgeBlockService;
        this.taskService = taskService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public RelationView create(UUID userId, RelationCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public RelationView create(UUID userId, UUID relationId, RelationCommand command) {
        NormalizedRelation relation = normalize(command);
        lockEndpointOwners(userId, relation);
        validateEndpointsForMutation(userId, relation);
        if (relationRepository.existsActiveDuplicate(
                userId, relation.sourceType(), relation.sourceId(), relation.targetType(),
                relation.targetId(), relation.type())) {
            throw new DomainException("MUTATION_REJECTED", "Relation already exists");
        }
        RelationView result = view(relationRepository.save(new RelationEntity(
                relationId, userId, relation.sourceType(), relation.sourceId(), relation.targetType(),
                relation.targetId(), relation.type(), relation.label())));
        publishChange(userId, result, "CREATE");
        return result;
    }

    @Transactional(readOnly = true)
    public List<RelationView> list(UUID userId) {
        return relationRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public CursorPage<RelationView> list(UUID userId, String encodedCursor, int requestedLimit) {
        int limit = pageLimit(requestedLimit);
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode("relations", encodedCursor);
        var rows = cursor == null
                ? relationRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
                        userId, PageRequest.of(0, limit + 1))
                : relationRepository.findPageAfter(
                        userId, cursor.updatedAt(), cursor.id(), PageRequest.of(0, limit + 1));
        boolean hasMore = rows.size() > limit;
        var page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode("relations", "", page.getLast().getUpdatedAt(), page.getLast().getId())
                : null;
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<RelationView> listIncludingDeleted(UUID userId) {
        return relationRepository.findAllByUserIdOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public RelationView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public RelationView update(UUID userId, UUID id, long baseVersion, RelationCommand command) {
        RelationEndpointSnapshot candidate = relationRepository.findEndpointSnapshotByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
        NormalizedRelation relation = normalize(command);
        NormalizedRelation existing = new NormalizedRelation(
                candidate.getSourceType(), candidate.getSourceId(), candidate.getTargetType(), candidate.getTargetId(),
                candidate.getType(), candidate.getLabel());
        lockEndpointOwners(userId, existing, relation);
        RelationEntity entity = relationRepository.findForUpdate(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
        requireActive(entity);
        requireVersion(entity, baseVersion);
        validateEndpointsForMutation(userId, relation);
        if (relationRepository.existsActiveDuplicateExcluding(
                userId, id, relation.sourceType(), relation.sourceId(), relation.targetType(),
                relation.targetId(), relation.type())) {
            throw new DomainException("MUTATION_REJECTED", "Relation already exists");
        }
        entity.update(
                relation.sourceType(), relation.sourceId(), relation.targetType(), relation.targetId(),
                relation.type(), relation.label());
        RelationView result = view(relationRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return result;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        RelationEndpointSnapshot candidate = relationRepository.findEndpointSnapshotByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
        lockEndpointOwners(userId, relationOf(candidate));
        RelationEntity entity = relationRepository.findForUpdate(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
        requireActive(entity);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        relationRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
    }

    @Transactional(noRollbackFor = DomainException.class)
    public RelationView restore(UUID userId, UUID id, long baseVersion) {
        RelationEndpointSnapshot candidate = relationRepository.findEndpointSnapshotByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
        NormalizedRelation relation = relationOf(candidate);
        lockEndpointOwners(userId, relation);
        RelationEntity entity = relationRepository.findForUpdate(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Relation is not deleted");
        }
        requireVersion(entity, baseVersion);
        relation = relationOf(entity);
        validateEndpointsForMutation(userId, relation);
        if (relationRepository.existsActiveDuplicateExcluding(
                userId, id, relation.sourceType(), relation.sourceId(), relation.targetType(),
                relation.targetId(), relation.type())) {
            throw new DomainException("MUTATION_REJECTED", "Relation already exists");
        }
        entity.restore();
        RelationView result = view(relationRepository.saveAndFlush(entity));
        publishChange(userId, result, "RESTORE");
        return result;
    }

    @EventListener
    @Transactional
    public void onResourceDeleted(ResourceDeletedEvent event) {
        if (event.resourceType() == ResourceType.RELATION) {
            return;
        }
        RelationNodeType nodeType = RelationNodeType.valueOf(event.resourceType().name());
        relationRepository.findAllActiveForUpdateOrderByIdAsc(event.userId()).stream()
                .filter(relation -> (relation.getSourceType() == nodeType && relation.getSourceId().equals(event.resourceId()))
                        || (relation.getTargetType() == nodeType && relation.getTargetId().equals(event.resourceId())))
                .forEach(relation -> {
                    relation.softDelete();
                    RelationEntity saved = relationRepository.saveAndFlush(relation);
                    publishChange(event.userId(), view(saved), "DELETE");
                });
    }

    private NormalizedRelation normalize(RelationCommand command) {
        if (command.sourceType() == null || command.sourceId() == null
                || command.targetType() == null || command.targetId() == null || command.type() == null) {
            throw new DomainException("VALIDATION_FAILED", "Relation endpoints and type are required");
        }
        if (command.sourceType() == command.targetType() && command.sourceId().equals(command.targetId())) {
            throw new DomainException("MUTATION_REJECTED", "A relation cannot target itself");
        }
        if (command.type() != RelationType.RELATED_TO) {
            return new NormalizedRelation(
                    command.sourceType(), command.sourceId(), command.targetType(), command.targetId(),
                    command.type(), command.label());
        }
        String sourceKey = endpointKey(command.sourceType(), command.sourceId());
        String targetKey = endpointKey(command.targetType(), command.targetId());
        if (sourceKey.compareTo(targetKey) <= 0) {
            return new NormalizedRelation(
                    command.sourceType(), command.sourceId(), command.targetType(), command.targetId(),
                    command.type(), command.label());
        }
        return new NormalizedRelation(
                command.targetType(), command.targetId(), command.sourceType(), command.sourceId(),
                command.type(), command.label());
    }

    private String endpointKey(RelationNodeType type, UUID id) {
        return type.name() + ":" + id;
    }

    private void validateEndpointsForMutation(UUID userId, NormalizedRelation relation) {
        validateEndpointForMutation(userId, relation.sourceType(), relation.sourceId());
        validateEndpointForMutation(userId, relation.targetType(), relation.targetId());
    }

    private void validateEndpointForMutation(UUID userId, RelationNodeType type, UUID id) {
        switch (type) {
            case SUBJECT -> subjectLockCoordinator.lockSubjects(userId, List.of(id));
            case SOURCE -> sourceService.requireActiveSourceForMutation(userId, id);
            case KNOWLEDGE_BLOCK -> knowledgeBlockService.requireActiveKnowledgeBlockForMutation(userId, id);
            case TASK -> taskService.requireActiveTaskForMutation(userId, id);
        }
    }

    private void lockEndpointOwners(UUID userId, NormalizedRelation... relations) {
        List<UUID> subjectIds = new ArrayList<>();
        for (NormalizedRelation relation : relations) {
            subjectIds.add(ownerSubjectId(userId, relation.sourceType(), relation.sourceId()));
            subjectIds.add(ownerSubjectId(userId, relation.targetType(), relation.targetId()));
        }
        subjectLockCoordinator.lockSubjects(userId, subjectIds);
    }

    private UUID ownerSubjectId(UUID userId, RelationNodeType type, UUID id) {
        switch (type) {
            case SUBJECT -> { return id; }
            case SOURCE -> { return sourceService.ownerSubjectIdForMutation(userId, id); }
            case KNOWLEDGE_BLOCK -> { return knowledgeBlockService.ownerSubjectIdForMutation(userId, id); }
            case TASK -> { return taskService.ownerSubjectIdForMutation(userId, id); }
        }
        throw new IllegalStateException("Unknown relation endpoint type: " + type);
    }

    private RelationEntity active(UUID userId, UUID id) {
        return relationRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
    }

    private RelationEntity mutable(UUID userId, UUID id) {
        return relationRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Relation was not found"));
    }

    private NormalizedRelation relationOf(RelationEntity entity) {
        return new NormalizedRelation(
                entity.getSourceType(), entity.getSourceId(), entity.getTargetType(), entity.getTargetId(),
                entity.getType(), entity.getLabel());
    }

    private NormalizedRelation relationOf(RelationEndpointSnapshot relation) {
        return new NormalizedRelation(
                relation.getSourceType(), relation.getSourceId(), relation.getTargetType(), relation.getTargetId(),
                relation.getType(), relation.getLabel());
    }

    private void requireActive(RelationEntity entity) {
        if (entity.getDeletedAt() != null) {
            throw new DomainException("RESOURCE_DELETED", "Relation has been deleted");
        }
    }

    private void requireVersion(RelationEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Relation version does not match", view(entity));
        }
    }

    private RelationView view(RelationEntity entity) {
        return new RelationView(
                entity.getId(), entity.getSourceType(), entity.getSourceId(), entity.getTargetType(),
                entity.getTargetId(), entity.getType(), entity.getLabel(), entity.getVersion(),
                entity.getCreatedAt(), entity.getUpdatedAt(), entity.getDeletedAt());
    }

    private void publishChange(UUID userId, RelationView view, String mutationType) {
        eventPublisher.publishEvent(new ResourceChangedEvent(
                userId, ResourceType.RELATION, view.id(), mutationType, view.version(), view.deletedAt(), view));
    }

    private int pageLimit(int requestedLimit) {
        if (requestedLimit < 1 || requestedLimit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
        return requestedLimit;
    }

    private record NormalizedRelation(
            RelationNodeType sourceType,
            UUID sourceId,
            RelationNodeType targetType,
            UUID targetId,
            RelationType type,
            String label) {
    }
}
