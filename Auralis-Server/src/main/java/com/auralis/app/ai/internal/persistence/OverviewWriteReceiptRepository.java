package com.auralis.app.ai.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OverviewWriteReceiptRepository extends JpaRepository<OverviewWriteReceiptEntity, UUID> {
    Optional<OverviewWriteReceiptEntity> findByUserIdAndClientWriteId(UUID userId, UUID clientWriteId);
}
