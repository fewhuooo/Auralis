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

    @Column(name = "parsed_document_id")
    private UUID parsedDocumentId;

    @Column(name = "ingestion_revision")
    private UUID ingestionRevision;

    @Column(nullable = false)
    private UUID generation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private IngestionJobStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "failure_count", nullable = false)
    private int failureCount;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

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
        this(id, userId, sourceId, status, UUID.randomUUID());
    }

    public IngestionJobEntity(
            UUID id, UUID userId, UUID sourceId, IngestionJobStatus status, UUID generation) {
        this(id, userId, sourceId, status, generation, null);
    }

    public IngestionJobEntity(
            UUID id,
            UUID userId,
            UUID sourceId,
            IngestionJobStatus status,
            UUID generation,
            UUID ingestionRevision) {
        this.id = id;
        this.userId = userId;
        this.sourceId = sourceId;
        this.status = status;
        this.generation = generation;
        this.ingestionRevision = ingestionRevision;
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
    public UUID getParsedDocumentId() { return parsedDocumentId; }
    public UUID getIngestionRevision() { return ingestionRevision; }
    public UUID getGeneration() { return generation; }
    public IngestionJobStatus getStatus() { return status; }
    public int getAttemptCount() { return attemptCount; }
    public int getFailureCount() { return failureCount; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
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

    public boolean ownsClaim(int claimedAttempt, Instant now) {
        return (status == IngestionJobStatus.PARSING || status == IngestionJobStatus.INDEXING)
                && attemptCount == claimedAttempt
                && leaseUntil != null
                && leaseUntil.isAfter(now);
    }

    public void attachParsedDocument(UUID parsedDocumentId, UUID ingestionRevision) {
        this.parsedDocumentId = parsedDocumentId;
        this.ingestionRevision = ingestionRevision;
    }

    public void claim(Instant now, Instant leaseUntil) {
        status = IngestionJobStatus.PARSING;
        attemptCount++;
        nextAttemptAt = null;
        startedAt = now;
        this.leaseUntil = leaseUntil;
        errorCode = null;
        errorDetail = null;
    }

    public void recordExpiredLeaseFailure(Instant now) {
        failureCount++;
        status = IngestionJobStatus.PENDING;
        leaseUntil = null;
        nextAttemptAt = null;
        completedAt = null;
        errorCode = "INGESTION_LEASE_EXPIRED";
        errorDetail = "Ingestion worker lease expired";
        updatedAt = now;
    }

    public boolean renewLease(int claimedAttempt, Instant now, Instant newLeaseUntil) {
        if (!ownsClaim(claimedAttempt, now) || newLeaseUntil == null || !newLeaseUntil.isAfter(now)) {
            return false;
        }
        if (leaseUntil == null || newLeaseUntil.isAfter(leaseUntil)) {
            leaseUntil = newLeaseUntil;
            updatedAt = now;
        }
        return true;
    }

    public void markReady(Instant now) {
        status = IngestionJobStatus.READY;
        completedAt = now;
        leaseUntil = null;
        nextAttemptAt = null;
    }

    public void markFailed(Instant now, String errorCode, String errorDetail) {
        status = IngestionJobStatus.FAILED;
        completedAt = now;
        leaseUntil = null;
        nextAttemptAt = null;
        this.errorCode = errorCode;
        this.errorDetail = errorDetail;
    }

    public void markRetry(Instant now, String errorCode, String errorDetail) {
        failureCount++;
        status = IngestionJobStatus.PENDING;
        leaseUntil = null;
        completedAt = null;
        nextAttemptAt = null;
        this.errorCode = errorCode;
        this.errorDetail = errorDetail;
        updatedAt = now;
    }

    public void markFinalFailure(Instant now, String errorCode, String errorDetail) {
        failureCount++;
        markFailed(now, errorCode, errorDetail);
    }

    public void deferUntil(Instant now, Instant retryAt, String errorCode) {
        if (now == null || retryAt == null) throw new IllegalArgumentException("now and retryAt are required");
        status = IngestionJobStatus.PENDING;
        leaseUntil = null;
        completedAt = null;
        nextAttemptAt = retryAt;
        this.errorCode = errorCode;
        this.errorDetail = "AI usage limit reached; retry is scheduled";
        updatedAt = now;
    }

}
