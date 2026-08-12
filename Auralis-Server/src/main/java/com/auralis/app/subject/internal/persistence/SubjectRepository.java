package com.auralis.app.subject.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubjectRepository extends JpaRepository<SubjectEntity, UUID> {

    Optional<SubjectEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<SubjectEntity> findByIdAndUserId(UUID id, UUID userId);

    List<SubjectEntity> findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(UUID userId);

    Optional<SubjectEntity> findByUserIdAndDefaultSubjectTrueAndDeletedAtIsNull(UUID userId);

    boolean existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID userId, String name);
}
