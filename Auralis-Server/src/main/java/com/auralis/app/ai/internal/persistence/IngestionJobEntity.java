package com.auralis.app.ai.internal.persistence;

import com.auralis.app.ai.IngestionJobStatus;
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
@Table(name = "ingestion_jobs")
public class IngestionJobEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "source_id", nullable = false)
    private UUID sourceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private IngestionJobStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "error_detail", length = 2000)
    private String errorDetail;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected IngestionJobEntity() {
    }

    public IngestionJobEntity(UUID id, UUID userId, UUID sourceId, IngestionJobStatus status) {
        this.id = id;
        this.userId = userId;
        this.sourceId = sourceId;
        this.status = status;
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
    public UUID getSourceId() { return sourceId; }
    public IngestionJobStatus getStatus() { return status; }
    public int getAttemptCount() { return attemptCount; }
    public Instant getLeaseUntil() { return leaseUntil; }
    public String getErrorCode() { return errorCode; }
    public String getErrorDetail() { return errorDetail; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getCreatedAt() { return createdAt; }

    public boolean isActive() {
        return status == IngestionJobStatus.PENDING
                || status == IngestionJobStatus.PARSING
                || status == IngestionJobStatus.INDEXING;
    }

    public void claim(Instant now, Instant leaseUntil) {
        status = IngestionJobStatus.PARSING;
        attemptCount++;
        startedAt = now;
        this.leaseUntil = leaseUntil;
        errorCode = null;
        errorDetail = null;
    }

    public void markReady(Instant now) {
        status = IngestionJobStatus.READY;
        completedAt = now;
        leaseUntil = null;
    }

    public void markFailed(Instant now, String errorCode, String errorDetail) {
        status = IngestionJobStatus.FAILED;
        completedAt = now;
        leaseUntil = null;
        this.errorCode = errorCode;
        this.errorDetail = errorDetail;
    }
}
