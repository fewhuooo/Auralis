package com.auralis.app.source;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.AssetFailureRecorder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import java.io.InputStream;

@Service
public class AssetService {

    private static final Logger log = LoggerFactory.getLogger(AssetService.class);

    private static final Pattern MIME_TYPE = Pattern.compile(
            "^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");

    private final AssetRepository assetRepository;
    private final AssetStoragePort assetStorage;
    private final AssetFailureRecorder assetFailureRecorder;
    private final AuralisProperties properties;

    public AssetService(
            AssetRepository assetRepository,
            AssetStoragePort assetStorage,
            AssetFailureRecorder assetFailureRecorder,
            AuralisProperties properties) {
        this.assetRepository = assetRepository;
        this.assetStorage = assetStorage;
        this.assetFailureRecorder = assetFailureRecorder;
        this.properties = properties;
    }

    @Transactional
    public AssetUploadIntentView createUploadIntent(UUID userId, AssetUploadIntentCommand command) {
        if (command.baseVersion() != 0) {
            throw new DomainException("VALIDATION_FAILED", "Create baseVersion must be 0");
        }
        String originalName = requiredName(command.originalName());
        if (command.sizeBytes() <= 0 || command.sizeBytes() > properties.upload().maxFileSizeBytes()) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "File size is outside the allowed range");
        }
        String mimeType = requiredMimeType(command.mimeType());
        String sha256 = optionalSha256(command.sha256());

        UUID assetId = UUID.randomUUID();
        String objectKey = "users/" + userId + "/assets/" + assetId;
        AssetStoragePort.UploadIntent intent;
        try {
            intent = assetStorage.createUploadIntent(objectKey, mimeType, command.sizeBytes(), sha256);
        } catch (RuntimeException exception) {
            log.warn("ASSET_UPLOAD_INTENT_FAILED userId={} mimeType={} sizeBytes={} errorType={}",
                    userId, mimeType, command.sizeBytes(), exception.getClass().getSimpleName());
            throw exception;
        }
        assetRepository.save(new AssetEntity(
                assetId, userId, objectKey, originalName, command.sizeBytes(), mimeType, sha256,
                AssetUploadStatus.UPLOADING));
        log.info("ASSET_UPLOAD_INTENT_CREATED userId={} assetId={} mimeType={} sizeBytes={}",
                userId, assetId, mimeType, command.sizeBytes());
        return new AssetUploadIntentView(assetId, intent.url(), intent.headers(), intent.expiresAt());
    }

    @Transactional
    public AssetView complete(UUID userId, UUID assetId) {
        log.info("ASSET_UPLOAD_COMPLETE_REQUESTED userId={} assetId={}", userId, assetId);
        AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        if (asset.getUploadStatus() == AssetUploadStatus.READY) {
            return view(asset);
        }
        if (asset.getUploadStatus() != AssetUploadStatus.UPLOADING) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not awaiting completion");
        }

        AssetStoragePort.ObjectMetadata metadata;
        try {
            metadata = assetStorage.headObject(asset.getObjectKey()).orElse(null);
        } catch (RuntimeException exception) {
            log.warn("ASSET_UPLOAD_COMPLETE_FAILED userId={} assetId={} stage=head errorType={}",
                    userId, assetId, exception.getClass().getSimpleName());
            throw exception;
        }
        if (metadata == null) {
            throw failUpload(userId, asset, "Uploaded object was not found");
        }
        if (metadata.sizeBytes() != asset.getSizeBytes()) {
            throw failUpload(userId, asset, "Uploaded object size does not match");
        }
        if (metadata.mimeType() == null || !asset.getMimeType().equalsIgnoreCase(metadata.mimeType())) {
            throw failUpload(userId, asset, "Uploaded object MIME type does not match");
        }
        if (asset.getSha256() != null
                && (metadata.sha256() == null || !asset.getSha256().equalsIgnoreCase(metadata.sha256()))) {
            throw failUpload(userId, asset, "Uploaded object checksum does not match");
        }

        asset.markReady();
        AssetView result = view(assetRepository.saveAndFlush(asset));
        log.info("ASSET_UPLOAD_READY userId={} assetId={} sizeBytes={} mimeType={}",
                userId, assetId, asset.getSizeBytes(), asset.getMimeType());
        return result;
    }

    @Transactional(readOnly = true)
    public AssetDownloadUrlView downloadUrl(UUID userId, UUID assetId) {
        AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        if (asset.getUploadStatus() != AssetUploadStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not ready for download");
        }
        AssetStoragePort.DownloadUrl downloadUrl = assetStorage.createDownloadUrl(asset.getObjectKey());
        return new AssetDownloadUrlView(downloadUrl.url(), downloadUrl.expiresAt());
    }

    public AssetView get(UUID userId, UUID assetId) {
        return view(assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found")));
    }

    @Transactional(readOnly = true)
    public AssetContent openContent(UUID userId, UUID assetId) {
        AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        if (asset.getUploadStatus() != AssetUploadStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not ready for ingestion");
        }
        InputStream stream = assetStorage.openObject(asset.getObjectKey());
        return new AssetContent(asset.getId(), asset.getObjectKey(), asset.getOriginalName(),
                asset.getMimeType(), asset.getSizeBytes(), stream);
    }

    private DomainException failUpload(UUID userId, AssetEntity asset, String detail) {
        log.warn("ASSET_UPLOAD_REJECTED userId={} assetId={} reason={}", userId, asset.getId(), detail);
        assetFailureRecorder.markFailed(userId, asset.getId());
        try {
            assetStorage.deleteObject(asset.getObjectKey());
        } catch (RuntimeException ignored) {
            // The failed DB state remains auditable when object cleanup is unavailable.
        }
        return new DomainException("UPLOAD_VALIDATION_FAILED", detail);
    }

    private String requiredName(String value) {
        if (value == null || value.isBlank()) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "Original file name is required");
        }
        String name = value.trim();
        if (name.length() > 255 || name.contains("/") || name.contains("\\") || name.equals(".") || name.equals("..")) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "Original file name is invalid");
        }
        return name;
    }

    private String requiredMimeType(String value) {
        if (value == null || !MIME_TYPE.matcher(value.trim()).matches()) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "MIME type is invalid");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private String optionalSha256(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String sha256 = value.trim();
        if (!SHA256.matcher(sha256).matches()) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "sha256 must be a 64-character hex value");
        }
        return sha256.toLowerCase(Locale.ROOT);
    }

    private AssetView view(AssetEntity entity) {
        return new AssetView(
                entity.getId(), entity.getOriginalName(), entity.getSizeBytes(), entity.getMimeType(),
                entity.getSha256(), entity.getUploadStatus(), entity.getCompletedAt(),
                entity.getCreatedAt(), entity.getUpdatedAt());
    }
}
