package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sources")
public class SourceEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SourceType type;

    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;

    @Column(nullable = false, length = 240)
    private String title;

    @Column(name = "asset_id")
    private UUID assetId;

    @Column(name = "origin_url", length = 2048)
    private String originUrl;

    @Column(name = "raw_text", columnDefinition = "TEXT")
    private String rawText;

    @Column(columnDefinition = "TEXT")
    private String outline;

    @Enumerated(EnumType.STRING)
    @Column(name = "ingestion_status", nullable = false, length = 16)
    private SourceIngestionStatus ingestionStatus;

    @Column(name = "safe_error_code", length = 64)
    private String safeErrorCode;

    @Column(name = "safe_error_detail", length = 2000)
    private String safeErrorDetail;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected SourceEntity() {
    }

    public SourceEntity(
            UUID id,
            UUID userId,
            SourceType type,
            UUID subjectId,
            String title,
            UUID assetId,
            String originUrl,
            String rawText,
            String outline,
            SourceIngestionStatus ingestionStatus) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.subjectId = subjectId;
        this.title = title;
        this.assetId = assetId;
        this.originUrl = originUrl;
        this.rawText = rawText;
        this.outline = outline;
        this.ingestionStatus = ingestionStatus;
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
    public SourceType getType() { return type; }
    public UUID getSubjectId() { return subjectId; }
    public String getTitle() { return title; }
    public UUID getAssetId() { return assetId; }
    public String getOriginUrl() { return originUrl; }
    public String getRawText() { return rawText; }
    public String getOutline() { return outline; }
    public SourceIngestionStatus getIngestionStatus() { return ingestionStatus; }
    public String getSafeErrorCode() { return safeErrorCode; }
    public String getSafeErrorDetail() { return safeErrorDetail; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }

    public void update(
            SourceType type,
            UUID subjectId,
            String title,
            UUID assetId,
            String originUrl,
            String rawText,
            String outline) {
        this.type = type;
        this.subjectId = subjectId;
        this.title = title;
        this.assetId = assetId;
        this.originUrl = originUrl;
        this.rawText = rawText;
        this.outline = outline;
        this.ingestionStatus = SourceIngestionStatus.PENDING;
        this.safeErrorCode = null;
        this.safeErrorDetail = null;
    }

    public void requestReingest() {
        ingestionStatus = SourceIngestionStatus.PENDING;
        safeErrorCode = null;
        safeErrorDetail = null;
    }

    public void markParsing() {
        ingestionStatus = SourceIngestionStatus.PARSING;
        safeErrorCode = null;
        safeErrorDetail = null;
    }

    public void markPending() {
        ingestionStatus = SourceIngestionStatus.PENDING;
        safeErrorCode = null;
        safeErrorDetail = null;
    }

    public void markIndexing() {
        ingestionStatus = SourceIngestionStatus.INDEXING;
        safeErrorCode = null;
        safeErrorDetail = null;
    }

    public void markReady() {
        ingestionStatus = SourceIngestionStatus.READY;
        safeErrorCode = null;
        safeErrorDetail = null;
    }

    public void markFailed(String safeErrorCode, String safeErrorDetail) {
        ingestionStatus = SourceIngestionStatus.FAILED;
        this.safeErrorCode = safeErrorCode;
        this.safeErrorDetail = safeErrorDetail;
    }

    public void softDelete() { deletedAt = Instant.now(); }
    public void restore() { deletedAt = null; }
}
