package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.AssetUploadStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "assets")
public class AssetEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "client_import_id")
    private UUID clientImportId;

    @Column(name = "object_key", nullable = false, length = 512)
    private String objectKey;

    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "mime_type", nullable = false, length = 128)
    private String mimeType;

    @Column(length = 64)
    private String sha256;

    @Enumerated(EnumType.STRING)
    @Column(name = "upload_status", nullable = false, length = 16)
    private AssetUploadStatus uploadStatus;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AssetEntity() {
    }

    public AssetEntity(
            UUID id,
            UUID userId,
            String objectKey,
            UUID clientImportId,
            String originalName,
            long sizeBytes,
            String mimeType,
            String sha256,
            AssetUploadStatus uploadStatus) {
        this.id = id;
        this.userId = userId;
        this.objectKey = objectKey;
        this.clientImportId = clientImportId;
        this.originalName = originalName;
        this.sizeBytes = sizeBytes;
        this.mimeType = mimeType;
        this.sha256 = sha256;
        this.uploadStatus = uploadStatus;
    }

    public AssetEntity(
            UUID id,
            UUID userId,
            String objectKey,
            String originalName,
            long sizeBytes,
            String mimeType,
            String sha256,
            AssetUploadStatus uploadStatus) {
        this(id, userId, objectKey, null, originalName, sizeBytes, mimeType, sha256, uploadStatus);
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getClientImportId() { return clientImportId; }
    public String getObjectKey() { return objectKey; }
    public String getOriginalName() { return originalName; }
    public long getSizeBytes() { return sizeBytes; }
    public String getMimeType() { return mimeType; }
    public String getSha256() { return sha256; }
    public AssetUploadStatus getUploadStatus() { return uploadStatus; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void markReady() {
        uploadStatus = AssetUploadStatus.READY;
        completedAt = Instant.now();
    }

    public void markFailed() {
        uploadStatus = AssetUploadStatus.FAILED;
    }

    public void prepareUploadRetry() {
        if (uploadStatus == AssetUploadStatus.FAILED) {
            uploadStatus = AssetUploadStatus.UPLOADING;
            completedAt = null;
        }
    }

    public void markOrphaned() {
        uploadStatus = AssetUploadStatus.ORPHANED;
    }

    public void setSha256IfAbsent(String sha256) {
        if (this.sha256 == null) {
            this.sha256 = sha256;
        }
    }
}
