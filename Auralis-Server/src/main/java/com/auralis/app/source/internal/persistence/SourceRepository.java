package com.auralis.app.source.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SourceRepository extends JpaRepository<SourceEntity, UUID> {

    Optional<SourceEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<SourceEntity> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    List<SourceEntity> findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(UUID userId);

    List<SourceEntity> findAllByUserIdOrderByUpdatedAtDescIdAsc(UUID userId);
}
