package com.auralis.app.source;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.AssetFailureRecorder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

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
    private final TransactionTemplate transactionTemplate;

    public AssetService(
            AssetRepository assetRepository,
            AssetStoragePort assetStorage,
            AssetFailureRecorder assetFailureRecorder,
            AuralisProperties properties,
            org.springframework.transaction.PlatformTransactionManager transactionManager) {
        this.assetRepository = assetRepository;
        this.assetStorage = assetStorage;
        this.assetFailureRecorder = assetFailureRecorder;
        this.properties = properties;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public AssetUploadIntentView createUploadIntent(UUID userId, AssetUploadIntentCommand command) {
        UploadMetadata metadata = validate(command);
        if (command.clientImportId() == null) {
            throw new DomainException("VALIDATION_FAILED", "clientImportId is required");
        }
        AssetEntity asset;
        try {
            asset = transactionTemplate.execute(status -> createUploadIntentInTransaction(userId, command, metadata));
        } catch (DataIntegrityViolationException race) {
            // The unique owner/key index is the cross-instance arbiter. The
            // losing transaction is already rolled back before this reload.
            asset = transactionTemplate.execute(status -> assetRepository
                    .findByUserIdAndClientImportId(userId, command.clientImportId())
                    .map(existing -> {
                        verifyImmutableMetadata(existing, metadata);
                        existing.prepareUploadRetry();
                        return existing;
                    })
                    .orElseThrow(() -> race));
        }
        // Keep the idempotency row committed even if signing the external
        // upload URL fails. A later retry must reload this same Asset.
        return issueUploadIntent(userId, asset);
    }

    private AssetEntity createUploadIntentInTransaction(
            UUID userId,
            AssetUploadIntentCommand command,
            UploadMetadata metadata) {
        var existing = assetRepository.findByUserIdAndClientImportId(userId, command.clientImportId());
        if (existing.isPresent()) {
            verifyImmutableMetadata(existing.get(), metadata);
            existing.get().prepareUploadRetry();
            return existing.get();
        }

        UUID assetId = UUID.randomUUID();
        String objectKey = "users/" + userId + "/assets/" + assetId;
        AssetEntity asset = assetRepository.saveAndFlush(new AssetEntity(
                assetId, userId, objectKey, command.clientImportId(), metadata.originalName(),
                metadata.sizeBytes(), metadata.mimeType(), metadata.sha256(), AssetUploadStatus.UPLOADING));
        return asset;
    }

    private AssetUploadIntentView issueUploadIntent(UUID userId, AssetEntity asset) {
        if (asset.getUploadStatus() != AssetUploadStatus.UPLOADING) {
            return new AssetUploadIntentView(
                    asset.getId(), null, java.util.Map.of(), null, asset.getUploadStatus());
        }
        AssetStoragePort.UploadIntent intent;
        try {
            intent = assetStorage.createUploadIntent(
                    asset.getObjectKey(), asset.getMimeType(), asset.getSizeBytes(), asset.getSha256());
        } catch (RuntimeException exception) {
            log.warn("ASSET_UPLOAD_INTENT_FAILED userId={} assetId={} mimeType={} sizeBytes={} errorType={}",
                    userId, asset.getId(), asset.getMimeType(), asset.getSizeBytes(),
                    exception.getClass().getSimpleName());
            throw exception;
        }
        log.info("ASSET_UPLOAD_INTENT_CREATED userId={} assetId={} mimeType={} sizeBytes={}",
                userId, asset.getId(), asset.getMimeType(), asset.getSizeBytes());
        return new AssetUploadIntentView(
                asset.getId(), intent.url(), intent.headers(), intent.expiresAt(), asset.getUploadStatus());
    }

    private UploadMetadata validate(AssetUploadIntentCommand command) {
        if (command.baseVersion() != 0) {
            throw new DomainException("VALIDATION_FAILED", "Create baseVersion must be 0");
        }
        String originalName = requiredName(command.originalName());
        if (command.sizeBytes() <= 0 || command.sizeBytes() > properties.upload().maxFileSizeBytes()) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "File size is outside the allowed range");
        }
        return new UploadMetadata(
                originalName, command.sizeBytes(), requiredMimeType(command.mimeType()), optionalSha256(command.sha256()));
    }

    private void verifyImmutableMetadata(AssetEntity existing, UploadMetadata metadata) {
        if (!existing.getOriginalName().equals(metadata.originalName())
                || existing.getSizeBytes() != metadata.sizeBytes()
                || !existing.getMimeType().equals(metadata.mimeType())
                || !java.util.Objects.equals(existing.getSha256(), metadata.sha256())) {
            throw new DomainException(
                    "MUTATION_REJECTED",
                    "clientImportId is already bound to different asset metadata");
        }
    }

    private record UploadMetadata(String originalName, long sizeBytes, String mimeType, String sha256) { }

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

    /**
     * Computes the hash from the server-side object stream and conditionally
     * fills the nullable legacy Asset checksum. Client declarations are never
     * used as the source of truth.
     */
    @Transactional
    public String ensureSha256(UUID userId, UUID assetId) {
        AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        if (asset.getSha256() != null) {
            return asset.getSha256();
        }
        if (asset.getUploadStatus() != AssetUploadStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not ready for checksum verification");
        }
        String computed = hashObject(asset.getObjectKey());
        int updated = assetRepository.updateSha256IfAbsent(assetId, userId, computed);
        if (updated > 0) {
            return computed;
        }
        return assetRepository.findByIdAndUserId(assetId, userId)
                .map(AssetEntity::getSha256)
                .filter(value -> value != null)
                .orElse(computed);
    }

    private String hashObject(String objectKey) {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
        try (InputStream input = assetStorage.openObject(objectKey)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) {
                    digest.update(buffer, 0, read);
                }
            }
        } catch (Exception exception) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "Asset checksum could not be verified", null, exception);
        }
        return java.util.HexFormat.of().formatHex(digest.digest());
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
