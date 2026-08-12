package com.auralis.app.identity.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefreshSessionRepository extends JpaRepository<RefreshSessionEntity, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from RefreshSessionEntity session where session.tokenHash = :tokenHash")
    Optional<RefreshSessionEntity> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    Optional<RefreshSessionEntity> findByIdAndUserId(UUID id, UUID userId);

    List<RefreshSessionEntity> findAllByUserIdOrderByLastUsedAtDesc(UUID userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query("update RefreshSessionEntity session set session.revokedAt = :revokedAt "
            + "where session.rotationFamilyId = :familyId and session.revokedAt is null")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("revokedAt") Instant revokedAt);
}
