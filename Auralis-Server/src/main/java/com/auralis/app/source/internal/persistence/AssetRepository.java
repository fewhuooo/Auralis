package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.AssetUploadStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AssetRepository extends JpaRepository<AssetEntity, UUID> {

    Optional<AssetEntity> findByIdAndUserId(UUID id, UUID userId);

    Optional<AssetEntity> findByIdAndUserIdAndUploadStatus(
            UUID id, UUID userId, AssetUploadStatus uploadStatus);
}
