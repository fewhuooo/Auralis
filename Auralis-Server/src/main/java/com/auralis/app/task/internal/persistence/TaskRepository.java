package com.auralis.app.task.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskRepository extends JpaRepository<TaskEntity, UUID> {

    Optional<TaskEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<TaskEntity> findByIdAndUserId(UUID id, UUID userId);

    List<TaskEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    List<TaskEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);
}
