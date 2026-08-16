package com.auralis.app.source.internal;

import com.auralis.app.source.AssetUploadStatus;
import com.auralis.app.source.internal.persistence.AssetRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AssetFailureRecorder {

    private final AssetRepository assetRepository;

    public AssetFailureRecorder(AssetRepository assetRepository) {
        this.assetRepository = assetRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(UUID userId, UUID assetId) {
        assetRepository.findByIdAndUserId(assetId, userId)
                .filter(asset -> asset.getUploadStatus() == AssetUploadStatus.UPLOADING)
                .ifPresent(asset -> {
                    asset.markFailed();
                    assetRepository.saveAndFlush(asset);
                });
    }
}
