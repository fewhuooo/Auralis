package com.auralis.app.subject;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.subject.internal.persistence.SubjectEntity;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Shared owner lock boundary for Subject-owned mutations.
 *
 * <p>Callers may discover owner ids before entering this boundary, but they
 * must not use discovered resource state for a mutation. This component only
 * canonicalizes, locks, and validates Subject rows.</p>
 */
@Component
public class SubjectLockCoordinator {

    private final SubjectRepository subjectRepository;

    public SubjectLockCoordinator(SubjectRepository subjectRepository) {
        this.subjectRepository = subjectRepository;
    }

    @Transactional
    public void lockSubjects(UUID userId, Collection<UUID> subjectIds) {
        lockSubjects(userId, subjectIds, true);
    }

    @Transactional
    public void lockSubjectsIncludingDeleted(UUID userId, Collection<UUID> subjectIds) {
        lockSubjects(userId, subjectIds, false);
    }

    private void lockSubjects(UUID userId, Collection<UUID> subjectIds, boolean requireActive) {
        if (subjectIds == null || subjectIds.stream().anyMatch(Objects::isNull)) {
            throw notFound();
        }
        List<UUID> orderedIds = subjectIds.stream()
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();
        if (orderedIds.isEmpty()) {
            return;
        }
        for (UUID subjectId : orderedIds) {
            SubjectEntity locked = subjectRepository.findForUpdateByIdAndUserId(subjectId, userId)
                    .orElseThrow(this::notFound);
            if (requireActive && locked.getDeletedAt() != null) {
                throw notFound();
            }
        }
    }

    private DomainException notFound() {
        return new DomainException("RESOURCE_NOT_FOUND", "Subject was not found");
    }
}
