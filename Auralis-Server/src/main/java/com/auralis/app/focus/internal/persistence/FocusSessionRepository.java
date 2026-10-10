package com.auralis.app.focus.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface FocusSessionRepository extends JpaRepository<FocusSessionEntity, UUID> {
    Optional<FocusSessionEntity> findByUserIdAndClientSessionId(UUID userId, UUID clientSessionId);
}
