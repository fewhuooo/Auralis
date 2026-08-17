package com.auralis.app.subject.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubjectRepository extends JpaRepository<SubjectEntity, UUID> {

    Optional<SubjectEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<SubjectEntity> findByIdAndUserId(UUID id, UUID userId);

    List<SubjectEntity> findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(UUID userId);

    List<SubjectEntity> findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(
            UUID userId, Pageable pageable);

    @Query("""
            select subject from SubjectEntity subject
            where subject.userId = :userId and subject.deletedAt is null
              and (subject.sortKey > :sortKey
                or (subject.sortKey = :sortKey and subject.updatedAt < :updatedAt)
                or (subject.sortKey = :sortKey and subject.updatedAt = :updatedAt and subject.id > :id))
            order by subject.sortKey asc, subject.updatedAt desc, subject.id asc
            """)
    List<SubjectEntity> findPageAfter(
            @Param("userId") UUID userId,
            @Param("sortKey") String sortKey,
            @Param("updatedAt") java.time.Instant updatedAt,
            @Param("id") UUID id,
            Pageable pageable);

    List<SubjectEntity> findAllByUserIdOrderBySortKeyAscUpdatedAtDescIdAsc(UUID userId);

    Optional<SubjectEntity> findByUserIdAndDefaultSubjectTrueAndDeletedAtIsNull(UUID userId);

    boolean existsByUserIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID userId, String name);
}
