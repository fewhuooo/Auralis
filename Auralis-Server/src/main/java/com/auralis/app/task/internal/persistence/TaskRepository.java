package com.auralis.app.task.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskRepository extends JpaRepository<TaskEntity, UUID> {

    Optional<TaskEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<TaskEntity> findByIdAndUserId(UUID id, UUID userId);

    List<TaskEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    List<TaskEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
            UUID userId, Pageable pageable);

    @Query("""
            select task from TaskEntity task
            where task.userId = :userId and task.deletedAt is null
              and (task.updatedAt < :updatedAt
                or (task.updatedAt = :updatedAt and task.id > :id))
            order by task.updatedAt desc, task.id asc
            """)
    List<TaskEntity> findPageAfter(
            @Param("userId") UUID userId,
            @Param("updatedAt") java.time.Instant updatedAt,
            @Param("id") UUID id,
            Pageable pageable);

    List<TaskEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);
}
