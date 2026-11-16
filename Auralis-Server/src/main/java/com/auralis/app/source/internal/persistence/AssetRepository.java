package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.AssetUploadStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.Collection;
import java.util.UUID;

public interface AssetRepository extends JpaRepository<AssetEntity, UUID> {

    Optional<AssetEntity> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select asset from AssetEntity asset where asset.id = :id and asset.userId = :userId")
    Optional<AssetEntity> findForUpdateByIdAndUserId(
            @Param("id") UUID id, @Param("userId") UUID userId);

    java.util.List<AssetEntity> findAllByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

    Optional<AssetEntity> findByUserIdAndClientImportId(UUID userId, UUID clientImportId);

    Optional<AssetEntity> findByIdAndUserIdAndUploadStatus(
            UUID id, UUID userId, AssetUploadStatus uploadStatus);

}
