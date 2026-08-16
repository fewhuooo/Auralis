package com.auralis.app.sync.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface InboundMutationRepository extends JpaRepository<InboundMutationEntity, UUID>, InboundMutationRepositoryCustom {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<InboundMutationEntity> findByUserIdAndDeviceIdAndClientMutationId(
            UUID userId, UUID deviceId, String clientMutationId);

    long deleteByCreatedAtBefore(Instant cutoff);
}
