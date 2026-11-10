package com.auralis.app.subject;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.subject.internal.persistence.SubjectEntity;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;

@Service
public class SubjectService {

    private final SubjectRepository subjectRepository;
    private final SubjectLockCoordinator subjectLockCoordinator;
    private final ApplicationEventPublisher eventPublisher;

    public SubjectService(
            SubjectRepository subjectRepository,
            SubjectLockCoordinator subjectLockCoordinator,
            ApplicationEventPublisher eventPublisher) {
        this.subjectRepository = subjectRepository;
        this.subjectLockCoordinator = subjectLockCoordinator;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public SubjectView create(UUID userId, SubjectCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SubjectView create(UUID userId, UUID subjectId, SubjectCommand command) {
        String name = requiredName(command.name());
        if (subjectRepository.existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(userId, name)) {
            throw new DomainException("MUTATION_REJECTED", "Subject name is already used");
        }
        SubjectView result = view(subjectRepository.save(new SubjectEntity(
                subjectId, userId, name, command.description(), command.iconKey(),
                defaultSortKey(command.sortKey()), false)));
        publishChange(userId, result, "CREATE");
        return result;
    }

    @Transactional(readOnly = true)
    public List<SubjectView> list(UUID userId) {
        return subjectRepository.findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(userId)
                .stream()
                .map(this::view)
                .toList();
    }

    @Transactional(readOnly = true)
    public CursorPage<SubjectView> list(UUID userId, String encodedCursor, int requestedLimit) {
        int limit = pageLimit(requestedLimit);
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode("subjects", encodedCursor);
        var rows = cursor == null
                ? subjectRepository.findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(
                        userId, PageRequest.of(0, limit + 1))
                : subjectRepository.findPageAfter(
                        userId, cursor.sortKey(), cursor.updatedAt(), cursor.id(), PageRequest.of(0, limit + 1));
        boolean hasMore = rows.size() > limit;
        var page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode("subjects", page.getLast().getSortKey(), page.getLast().getUpdatedAt(),
                        page.getLast().getId())
                : null;
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<SubjectView> listIncludingDeleted(UUID userId) {
        return subjectRepository.findAllByUserIdOrderBySortKeyAscUpdatedAtDescIdAsc(userId)
                .stream()
                .map(this::view)
                .toList();
    }

    @Transactional(readOnly = true)
    public SubjectView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SubjectView update(UUID userId, UUID id, long baseVersion, SubjectCommand command) {
        subjectLockCoordinator.lockSubjects(userId, List.of(id));
        SubjectEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        String name = requiredName(command.name());
        if (!entity.getName().equalsIgnoreCase(name)
                && subjectRepository.existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(userId, name)) {
            throw new DomainException("MUTATION_REJECTED", "Subject name is already used");
        }
        entity.update(name, command.description(), command.iconKey(), command.sortKey());
        SubjectView result = view(subjectRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return result;
    }

    @Transactional
    public void delete(UUID userId, UUID id, long baseVersion) {
        subjectLockCoordinator.lockSubjects(userId, List.of(id));
        SubjectEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        subjectRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
        eventPublisher.publishEvent(new ResourceDeletedEvent(userId, ResourceType.SUBJECT, id));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SubjectView restore(UUID userId, UUID id, long baseVersion) {
        subjectLockCoordinator.lockSubjectsIncludingDeleted(userId, List.of(id));
        SubjectEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Subject is not deleted");
        }
        requireVersion(entity, baseVersion);
        if (subjectRepository.existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(userId, entity.getName())) {
            throw new DomainException("MUTATION_REJECTED", "Subject name is already used");
        }
        entity.restore();
        SubjectView result = view(subjectRepository.saveAndFlush(entity));
        publishChange(userId, result, "RESTORE");
        return result;
    }

    @Transactional(readOnly = true)
    public SubjectView requireActiveSubject(UUID userId, UUID id) {
        return get(userId, id);
    }

    @Transactional(readOnly = true)
    public Set<UUID> findActiveSubjectIds(UUID userId, Collection<UUID> ids) {
        if (ids.isEmpty()) return Set.of();
        return Set.copyOf(subjectRepository.findActiveIdsByUserIdAndIdIn(userId, ids));
    }

    /**
     * Locks an active Subject for a child mutation. Subject deletion holds the
     * same row lock while it scans and cascades, preventing a late child insert
     * from passing validation after the cascade scan.
     */
    @Transactional
    public SubjectView requireActiveSubjectForMutation(UUID userId, UUID id) {
        subjectLockCoordinator.lockSubjects(userId, List.of(id));
        return view(active(userId, id));
    }

    @Transactional
    public void requireActiveSubjectsForMutation(UUID userId, Collection<UUID> ids) {
        subjectLockCoordinator.lockSubjects(userId, ids);
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
                entity.getId(), entity.getName(), entity.getDescription(), entity.getIconKey(),
                entity.getSortKey(), entity.isDefaultSubject(), entity.getVersion(), entity.getCreatedAt(),
                entity.getUpdatedAt(), entity.getDeletedAt());
    }

    private void publishChange(UUID userId, SubjectView view, String mutationType) {
        eventPublisher.publishEvent(new ResourceChangedEvent(
                userId, ResourceType.SUBJECT, view.id(), mutationType, view.version(), view.deletedAt(), view));
    }

    private int pageLimit(int requestedLimit) {
        if (requestedLimit < 1 || requestedLimit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
        return requestedLimit;
    }
}
