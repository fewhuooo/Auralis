package com.auralis.app.knowledge;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockEntity;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.source.SourceService;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.ArrayList;
import java.util.UUID;

@Service
public class KnowledgeBlockService {

    private final KnowledgeBlockRepository knowledgeBlockRepository;
    private final SubjectService subjectService;
    private final SourceService sourceService;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public KnowledgeBlockService(
            KnowledgeBlockRepository knowledgeBlockRepository,
            SubjectService subjectService,
            SourceService sourceService,
            ApplicationEventPublisher eventPublisher) {
        this.knowledgeBlockRepository = knowledgeBlockRepository;
        this.subjectService = subjectService;
        this.sourceService = sourceService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public KnowledgeBlockView create(UUID userId, KnowledgeBlockCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public KnowledgeBlockView create(UUID userId, UUID blockId, KnowledgeBlockCommand command) {
        List<UUID> ownerSubjectIds = new ArrayList<>();
        ownerSubjectIds.add(command.subjectId());
        if (command.sourceId() != null) {
            ownerSubjectIds.add(sourceService.ownerSubjectIdForMutation(userId, command.sourceId()));
        }
        subjectService.requireActiveSubjectsForMutation(userId, ownerSubjectIds);
        validateSource(userId, command.sourceId());
        KnowledgeBlockView result = view(knowledgeBlockRepository.save(new KnowledgeBlockEntity(
                blockId, userId, command.subjectId(), command.sourceId(), required(command.title(), "title"),
                command.summary(), required(command.content(), "content"), encodeTags(command.tags()), command.colorOverride())));
        publishChange(userId, result, "CREATE");
        return result;
    }

    @Transactional(readOnly = true)
    public List<KnowledgeBlockView> list(UUID userId) {
        return knowledgeBlockRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public CursorPage<KnowledgeBlockView> list(UUID userId, String encodedCursor, int requestedLimit) {
        int limit = pageLimit(requestedLimit);
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode("knowledge-blocks", encodedCursor);
        var rows = cursor == null
                ? knowledgeBlockRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
                        userId, PageRequest.of(0, limit + 1))
                : knowledgeBlockRepository.findPageAfter(
                        userId, cursor.updatedAt(), cursor.id(), PageRequest.of(0, limit + 1));
        boolean hasMore = rows.size() > limit;
        var page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode("knowledge-blocks", "", page.getLast().getUpdatedAt(), page.getLast().getId())
                : null;
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<KnowledgeBlockView> listIncludingDeleted(UUID userId) {
        return knowledgeBlockRepository.findAllByUserIdOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public KnowledgeBlockView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional
    public KnowledgeBlockView requireActiveKnowledgeBlockForMutation(UUID userId, UUID id) {
        KnowledgeBlockEntity candidate = mutable(userId, id);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        return view(active(userId, id));
    }

    @Transactional(readOnly = true)
    public UUID ownerSubjectIdForMutation(UUID userId, UUID id) {
        return mutable(userId, id).getSubjectId();
    }

    @Transactional(noRollbackFor = DomainException.class)
    public KnowledgeBlockView update(UUID userId, UUID id, long baseVersion, KnowledgeBlockCommand command) {
        KnowledgeBlockEntity candidate = mutable(userId, id);
        requireActive(candidate);
        List<UUID> ownerSubjectIds = new ArrayList<>();
        ownerSubjectIds.add(candidate.getSubjectId());
        ownerSubjectIds.add(command.subjectId());
        if (command.sourceId() != null) {
            ownerSubjectIds.add(sourceService.ownerSubjectIdForMutation(userId, command.sourceId()));
        }
        subjectService.requireActiveSubjectsForMutation(userId, ownerSubjectIds);
        KnowledgeBlockEntity entity = active(userId, id);
        requireVersion(entity, baseVersion);
        validateSource(userId, command.sourceId());
        entity.update(command.subjectId(), command.sourceId(), required(command.title(), "title"), command.summary(),
                required(command.content(), "content"), encodeTags(command.tags()), command.colorOverride());
        KnowledgeBlockView result = view(knowledgeBlockRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return result;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        KnowledgeBlockEntity candidate = mutable(userId, id);
        requireActive(candidate);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        KnowledgeBlockEntity entity = active(userId, id);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        knowledgeBlockRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
        eventPublisher.publishEvent(new ResourceDeletedEvent(userId, ResourceType.KNOWLEDGE_BLOCK, id));
    }

    @EventListener
    @Transactional
    public void onSubjectDeleted(ResourceDeletedEvent event) {
        if (event.resourceType() != ResourceType.SUBJECT) {
            return;
        }
        knowledgeBlockRepository.findAllByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
                        event.userId(), event.resourceId())
                .forEach(block -> {
                    block.softDelete();
                    KnowledgeBlockView result = view(knowledgeBlockRepository.saveAndFlush(block));
                    publishChange(event.userId(), result, "DELETE");
                    eventPublisher.publishEvent(new ResourceDeletedEvent(
                            event.userId(), ResourceType.KNOWLEDGE_BLOCK, block.getId()));
                });
    }

    @Transactional(noRollbackFor = DomainException.class)
    public KnowledgeBlockView restore(UUID userId, UUID id, long baseVersion) {
        KnowledgeBlockEntity candidate = mutable(userId, id);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        KnowledgeBlockEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Knowledge block is not deleted");
        }
        requireVersion(entity, baseVersion);
        entity.restore();
        KnowledgeBlockView result = view(knowledgeBlockRepository.saveAndFlush(entity));
        publishChange(userId, result, "RESTORE");
        return result;
    }

    private KnowledgeBlockEntity active(UUID userId, UUID id) {
        return knowledgeBlockRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Knowledge block was not found"));
    }

    private KnowledgeBlockEntity mutable(UUID userId, UUID id) {
        return knowledgeBlockRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Knowledge block was not found"));
    }

    private void requireActive(KnowledgeBlockEntity entity) {
        if (entity.getDeletedAt() != null) {
            throw new DomainException("RESOURCE_DELETED", "Knowledge block has been deleted");
        }
    }

    private void requireVersion(KnowledgeBlockEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Knowledge block version does not match", view(entity));
        }
    }

    private String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", field + " is required");
        }
        return value.trim();
    }

    private void validateSource(UUID userId, UUID sourceId) {
        if (sourceId != null) {
            sourceService.requireActiveSourceForMutation(userId, sourceId);
        }
    }

    private String encodeTags(List<String> tags) {
        try {
            return objectMapper.writeValueAsString(tags == null ? List.of() : tags);
        } catch (JacksonException exception) {
            throw new DomainException("VALIDATION_FAILED", "Tags could not be encoded");
        }
    }

    private KnowledgeBlockView view(KnowledgeBlockEntity entity) {
        return new KnowledgeBlockView(
                entity.getId(), entity.getSubjectId(), entity.getSourceId(), entity.getTitle(), entity.getSummary(),
                entity.getContent(), decodeTags(entity.getTags()), entity.getColorOverride(), entity.getVersion(),
                entity.getCreatedAt(), entity.getUpdatedAt(), entity.getDeletedAt());
    }

    private List<String> decodeTags(String tags) {
        try {
            return objectMapper.readValue(tags, new TypeReference<>() { });
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored tags could not be decoded");
        }
    }

    private void publishChange(UUID userId, KnowledgeBlockView view, String mutationType) {
        eventPublisher.publishEvent(new ResourceChangedEvent(
                userId, ResourceType.KNOWLEDGE_BLOCK, view.id(), mutationType, view.version(), view.deletedAt(), view));
    }

    private int pageLimit(int requestedLimit) {
        if (requestedLimit < 1 || requestedLimit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
        return requestedLimit;
    }
}
