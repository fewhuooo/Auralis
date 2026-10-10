package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.AssetUploadStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
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

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("update AssetEntity asset set asset.sha256 = :sha256 "
            + "where asset.id = :assetId and asset.userId = :userId and asset.sha256 is null")
    int updateSha256IfAbsent(
            @Param("assetId") UUID assetId,
            @Param("userId") UUID userId,
            @Param("sha256") String sha256);
}
