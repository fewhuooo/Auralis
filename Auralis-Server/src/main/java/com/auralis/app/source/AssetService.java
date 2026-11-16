package com.auralis.app.source;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
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

    private final jakarta.persistence.EntityManager entityManager;
    private final AssetRepository assetRepository;
    private final AssetStoragePort assetStorage;
    private final IdentityService identityService;
    private final AuralisProperties properties;
    private final TransactionTemplate transactionTemplate;

    public AssetService(
            AssetRepository assetRepository,
            jakarta.persistence.EntityManager entityManager,
            AssetStoragePort assetStorage,
            IdentityService identityService,
            AuralisProperties properties,
            org.springframework.transaction.PlatformTransactionManager transactionManager) {
        this.assetRepository = assetRepository;
        this.entityManager = entityManager;
        this.assetStorage = assetStorage;
        this.identityService = identityService;
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
            asset = transactionTemplate.execute(status -> {
                identityService.lockActiveUserForStorage(userId);
                return assetRepository.findByUserIdAndClientImportId(userId, command.clientImportId())
                        .map(existing -> {
                            AssetEntity current = lockAsset(userId, existing.getId());
                            verifyImmutableMetadata(current, metadata);
                            current.prepareUploadRetry();
                            return current;
                        })
                        .orElseThrow(() -> race);
            });
        }
        // Keep the idempotency row committed even if signing the external
        // upload URL fails. A later retry must reload this same Asset.
        UUID assetId = asset.getId();
        return transactionTemplate.execute(status -> {
            identityService.lockActiveUserForStorage(userId);
            AssetEntity current = lockAsset(userId, assetId);
            return issueUploadIntent(userId, current);
        });
    }

    private AssetEntity createUploadIntentInTransaction(
            UUID userId,
            AssetUploadIntentCommand command,
            UploadMetadata metadata) {
        identityService.lockActiveUserForStorage(userId);
        var existing = assetRepository.findByUserIdAndClientImportId(userId, command.clientImportId());
        if (existing.isPresent()) {
            AssetEntity current = lockAsset(userId, existing.get().getId());
            verifyImmutableMetadata(current, metadata);
            current.prepareUploadRetry();
            return current;
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
                || (metadata.sha256() != null && !java.util.Objects.equals(existing.getSha256(), metadata.sha256()))) {
            throw new DomainException(
                    "MUTATION_REJECTED",
                    "clientImportId is already bound to different asset metadata");
        }
    }

    private record UploadMetadata(String originalName, long sizeBytes, String mimeType, String sha256) { }

    @Transactional(propagation = Propagation.NEVER)
    public AssetView complete(UUID userId, UUID assetId) {
        AssetSnapshot snapshot = snapshot(userId, assetId);
        if (snapshot.asset().uploadStatus() == AssetUploadStatus.READY) {
            return snapshot.asset();
        }
        if (snapshot.asset().uploadStatus() != AssetUploadStatus.UPLOADING) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not awaiting completion");
        }

        AssetStoragePort.ObjectMetadata metadata = assetStorage.headObject(snapshot.objectKey()).orElse(null);
        CompletionResult result = transactionTemplate.execute(status -> {
            identityService.lockActiveUserForStorage(userId);
            AssetEntity current = lockAsset(userId, assetId);
            if (current.getUploadStatus() == AssetUploadStatus.READY) {
                return new CompletionResult(view(current), null);
            }
            requireUnchanged(current, snapshot);
            if (current.getUploadStatus() != AssetUploadStatus.UPLOADING) {
                throw new DomainException("MUTATION_REJECTED", "Asset is not awaiting completion");
            }
            String failure = metadata == null ? "Uploaded object was not found"
                    : metadata.sizeBytes() != current.getSizeBytes() ? "Uploaded object size does not match"
                    : metadata.mimeType() == null || !current.getMimeType().equalsIgnoreCase(metadata.mimeType())
                    ? "Uploaded object MIME type does not match"
                    : current.getSha256() != null && (metadata.sha256() == null
                            || !current.getSha256().equalsIgnoreCase(metadata.sha256()))
                    ? "Uploaded object checksum does not match" : null;
            if (failure != null) {
                current.markFailed();
                assetRepository.saveAndFlush(current);
                return new CompletionResult(null, failure);
            }
            current.markReady();
            return new CompletionResult(view(assetRepository.saveAndFlush(current)), null);
        });
        if (result.failure() != null) {
            // A retry can replace this object immediately after FAILED commits. Deleting
            // outside the transaction could remove that retry's successfully uploaded bytes.
            log.warn("ASSET_UPLOAD_REJECTED userId={} assetId={} reason={}", userId, assetId, result.failure());
            throw new DomainException("UPLOAD_VALIDATION_FAILED", result.failure());
        }
        return result.asset();
    }

    private record CompletionResult(AssetView asset, String failure) { }

    @Transactional(readOnly = true)
    public AssetDownloadUrlView downloadUrl(UUID userId, UUID assetId) {
        AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        if (asset.getUploadStatus() != AssetUploadStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not ready for download");
        }
        AssetStoragePort.DownloadUrl downloadUrl = assetStorage.createDownloadUrl(asset.getObjectKey());
        return new AssetDownloadUrlView(
                downloadUrl.url(), downloadUrl.expiresAt(), asset.getOriginalName(), asset.getMimeType());
    }

    public AssetView get(UUID userId, UUID assetId) {
        return view(assetRepository.findByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found")));
    }

    @Transactional(propagation = Propagation.NEVER)
    public String ensureSha256(UUID userId, UUID assetId) {
        AssetSnapshot snapshot = snapshot(userId, assetId);
        if (snapshot.asset().uploadStatus() != AssetUploadStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Asset is not ready for checksum verification");
        }
        if (snapshot.asset().sha256() != null) {
            return snapshot.asset().sha256();
        }
        String computed = hashObject(snapshot.objectKey());
        return transactionTemplate.execute(status -> {
            identityService.lockActiveUserForStorage(userId);
            AssetEntity current = lockAsset(userId, assetId);
            if (current.getUploadStatus() != AssetUploadStatus.READY) {
                throw new DomainException("MUTATION_REJECTED", "Asset is not ready for checksum verification");
            }
            if (current.getSha256() != null) {
                return current.getSha256();
            }
            requireUnchanged(current, snapshot);
            current.setSha256IfAbsent(computed);
            assetRepository.saveAndFlush(current);
            return current.getSha256();
        });
    }

    private AssetSnapshot snapshot(UUID userId, UUID assetId) {
        return transactionTemplate.execute(status -> {
            AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
                    .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
            return new AssetSnapshot(view(asset), asset.getObjectKey());
        });
    }

    private AssetEntity lockAsset(UUID userId, UUID assetId) {
        AssetEntity asset = assetRepository.findForUpdateByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        entityManager.refresh(asset);
        return asset;
    }

    private void requireUnchanged(AssetEntity current, AssetSnapshot snapshot) {
        if (!java.util.Objects.equals(current.getUpdatedAt(), snapshot.asset().updatedAt())
                || !current.getObjectKey().equals(snapshot.objectKey())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Asset changed during object verification");
        }
    }

    private record AssetSnapshot(AssetView asset, String objectKey) { }

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
