package com.auralis.app.source.internal.persistence;

import com.auralis.app.source.ParsedDocumentStatus;
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
@Table(name = "parsed_documents")
public class ParsedDocumentEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "source_id", nullable = false)
    private UUID sourceId;

    @Column(name = "ingestion_revision", nullable = false)
    private UUID ingestionRevision;

    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;

    @Column(name = "parser_id", nullable = false, length = 128)
    private String parserId;

    @Column(name = "parser_version", nullable = false, length = 128)
    private String parserVersion;

    @Column(name = "normalization_version", nullable = false, length = 128)
    private String normalizationVersion;

    @Column(name = "ocr_model_version", length = 160)
    private String ocrModelVersion;

    @Column(name = "source_asset_sha256", length = 64)
    private String sourceAssetSha256;

    @Column(name = "plain_text_sha256", length = 64)
    private String plainTextSha256;

    @Column(name = "payload_sha256", nullable = false, length = 64)
    private String payloadSha256;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "object_key", nullable = false, length = 1024)
    private String objectKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ParsedDocumentStatus status;

    @Column
    private UUID generation;

    @Column(name = "object_deleted_at")
    private Instant objectDeletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "received_at")
    private Instant receivedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ParsedDocumentEntity() {
    }

    public ParsedDocumentEntity(
            UUID id,
            UUID userId,
            UUID sourceId,
            UUID ingestionRevision,
            int schemaVersion,
            String parserId,
            String parserVersion,
            String normalizationVersion,
            String ocrModelVersion,
            String sourceAssetSha256,
            String payloadSha256,
            long sizeBytes,
            String objectKey) {
        this.id = id;
        this.userId = userId;
        this.sourceId = sourceId;
        this.ingestionRevision = ingestionRevision;
        this.schemaVersion = schemaVersion;
        this.parserId = parserId;
        this.parserVersion = parserVersion;
        this.normalizationVersion = normalizationVersion;
        this.ocrModelVersion = ocrModelVersion;
        this.sourceAssetSha256 = sourceAssetSha256;
        this.payloadSha256 = payloadSha256;
        this.sizeBytes = sizeBytes;
        this.objectKey = objectKey;
        this.status = ParsedDocumentStatus.UPLOADING;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (status == null) {
            status = ParsedDocumentStatus.UPLOADING;
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
    public UUID getSourceId() { return sourceId; }
    public UUID getIngestionRevision() { return ingestionRevision; }
    public int getSchemaVersion() { return schemaVersion; }
    public String getParserId() { return parserId; }
    public String getParserVersion() { return parserVersion; }
    public String getNormalizationVersion() { return normalizationVersion; }
    public String getOcrModelVersion() { return ocrModelVersion; }
    public String getSourceAssetSha256() { return sourceAssetSha256; }
    public String getPlainTextSha256() { return plainTextSha256; }
    public String getPayloadSha256() { return payloadSha256; }
    public long getSizeBytes() { return sizeBytes; }
    public String getObjectKey() { return objectKey; }
    public ParsedDocumentStatus getStatus() { return status; }
    public UUID getGeneration() { return generation; }
    public Instant getObjectDeletedAt() { return objectDeletedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReceivedAt() { return receivedAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void markValidating() {
        status = ParsedDocumentStatus.VALIDATING;
    }

    public void accept(String plainTextSha256, UUID generation) {
        this.plainTextSha256 = plainTextSha256;
        this.generation = generation;
        this.status = ParsedDocumentStatus.ACCEPTED;
        this.receivedAt = Instant.now();
    }

    public void supersede() {
        status = ParsedDocumentStatus.SUPERSEDED;
    }

    public void reject() {
        status = ParsedDocumentStatus.REJECTED;
    }

    public void markObjectDeleted() {
        if (objectDeletedAt == null) {
            objectDeletedAt = Instant.now();
        }
    }
}
