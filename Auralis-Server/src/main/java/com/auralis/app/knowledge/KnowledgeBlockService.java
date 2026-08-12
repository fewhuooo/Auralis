package com.auralis.app.knowledge;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockEntity;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.subject.SubjectService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class KnowledgeBlockService {

    private final KnowledgeBlockRepository knowledgeBlockRepository;
    private final SubjectService subjectService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public KnowledgeBlockService(
            KnowledgeBlockRepository knowledgeBlockRepository,
            SubjectService subjectService) {
        this.knowledgeBlockRepository = knowledgeBlockRepository;
        this.subjectService = subjectService;
    }

    @Transactional
    public KnowledgeBlockView create(UUID userId, KnowledgeBlockCommand command) {
        validateSource(command.sourceId());
        subjectService.requireActiveSubject(userId, command.subjectId());
        return view(knowledgeBlockRepository.save(new KnowledgeBlockEntity(
                UUID.randomUUID(), userId, command.subjectId(), command.sourceId(), required(command.title(), "title"),
                command.summary(), required(command.content(), "content"), encodeTags(command.tags()), command.colorOverride())));
    }

    @Transactional(readOnly = true)
    public List<KnowledgeBlockView> list(UUID userId) {
        return knowledgeBlockRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public KnowledgeBlockView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional
    public KnowledgeBlockView update(UUID userId, UUID id, long baseVersion, KnowledgeBlockCommand command) {
        validateSource(command.sourceId());
        KnowledgeBlockEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        subjectService.requireActiveSubject(userId, command.subjectId());
        entity.update(command.subjectId(), command.sourceId(), required(command.title(), "title"), command.summary(),
                required(command.content(), "content"), encodeTags(command.tags()), command.colorOverride());
        return view(knowledgeBlockRepository.saveAndFlush(entity));
    }

    @Transactional
    public void delete(UUID userId, UUID id, long baseVersion) {
        KnowledgeBlockEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        knowledgeBlockRepository.saveAndFlush(entity);
    }

    @Transactional
    public KnowledgeBlockView restore(UUID userId, UUID id, long baseVersion) {
        KnowledgeBlockEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Knowledge block is not deleted");
        }
        requireVersion(entity, baseVersion);
        subjectService.requireActiveSubject(userId, entity.getSubjectId());
        entity.restore();
        return view(knowledgeBlockRepository.saveAndFlush(entity));
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

    private void validateSource(UUID sourceId) {
        if (sourceId != null) {
            throw new DomainException("MUTATION_REJECTED", "Source linking is not available in phase 2A");
        }
    }

    private String encodeTags(List<String> tags) {
        try {
            return objectMapper.writeValueAsString(tags == null ? List.of() : tags);
        } catch (JsonProcessingException exception) {
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
        } catch (JsonProcessingException exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored tags could not be decoded");
        }
    }
}
