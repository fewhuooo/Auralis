package com.auralis.app.subject;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.subject.internal.persistence.SubjectEntity;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class SubjectService {

    public static final String DEFAULT_SUBJECT_NAME = "未分类";

    private final SubjectRepository subjectRepository;

    public SubjectService(SubjectRepository subjectRepository) {
        this.subjectRepository = subjectRepository;
    }

    @Transactional
    public SubjectView create(UUID userId, SubjectCommand command) {
        String name = requiredName(command.name());
        if (subjectRepository.existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(userId, name)) {
            throw new DomainException("MUTATION_REJECTED", "Subject name is already used");
        }
        return view(subjectRepository.save(new SubjectEntity(
                UUID.randomUUID(), userId, name, command.description(), command.iconKey(),
                command.color(), defaultSortKey(command.sortKey()), false)));
    }

    @Transactional(readOnly = true)
    public List<SubjectView> list(UUID userId) {
        return subjectRepository.findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(userId)
                .stream()
                .map(this::view)
                .toList();
    }

    @Transactional(readOnly = true)
    public SubjectView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional
    public SubjectView update(UUID userId, UUID id, long baseVersion, SubjectCommand command) {
        SubjectEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        String name = requiredName(command.name());
        if (!entity.getName().equalsIgnoreCase(name)
                && subjectRepository.existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(userId, name)) {
            throw new DomainException("MUTATION_REJECTED", "Subject name is already used");
        }
        entity.update(name, command.description(), command.iconKey(), command.color(), command.sortKey());
        return view(subjectRepository.saveAndFlush(entity));
    }

    @Transactional
    public void delete(UUID userId, UUID id, long baseVersion) {
        SubjectEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        if (entity.isDefaultSubject()) {
            throw new DomainException("MUTATION_REJECTED", "The default subject cannot be deleted");
        }
        entity.softDelete();
        subjectRepository.saveAndFlush(entity);
    }

    @Transactional
    public SubjectView restore(UUID userId, UUID id, long baseVersion) {
        SubjectEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Subject is not deleted");
        }
        requireVersion(entity, baseVersion);
        if (subjectRepository.existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(userId, entity.getName())) {
            throw new DomainException("MUTATION_REJECTED", "Subject name is already used");
        }
        entity.restore();
        return view(subjectRepository.saveAndFlush(entity));
    }

    @Transactional
    public SubjectView ensureDefaultSubject(UUID userId) {
        return subjectRepository.findByUserIdAndDefaultSubjectTrueAndDeletedAtIsNull(userId)
                .map(this::view)
                .orElseGet(() -> {
                    SubjectEntity entity = new SubjectEntity(
                            UUID.randomUUID(), userId, DEFAULT_SUBJECT_NAME, null, null, null, "0000", true);
                    return view(subjectRepository.save(entity));
                });
    }

    @Transactional(readOnly = true)
    public SubjectView requireActiveSubject(UUID userId, UUID id) {
        return get(userId, id);
    }

    private SubjectEntity active(UUID userId, UUID id) {
        return subjectRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Subject was not found"));
    }

    private SubjectEntity mutable(UUID userId, UUID id) {
        return subjectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Subject was not found"));
    }

    private void requireActive(SubjectEntity entity) {
        if (entity.getDeletedAt() != null) {
            throw new DomainException("RESOURCE_DELETED", "Subject has been deleted");
        }
    }

    private void requireVersion(SubjectEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Subject version does not match", view(entity));
        }
    }

    private String requiredName(String name) {
        if (name == null || name.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "Subject name is required");
        }
        return name.trim();
    }

    private String defaultSortKey(String sortKey) {
        return sortKey == null ? "" : sortKey;
    }

    private SubjectView view(SubjectEntity entity) {
        return new SubjectView(
                entity.getId(), entity.getName(), entity.getDescription(), entity.getIconKey(), entity.getColor(),
                entity.getSortKey(), entity.isDefaultSubject(), entity.getVersion(), entity.getCreatedAt(),
                entity.getUpdatedAt(), entity.getDeletedAt());
    }
}
