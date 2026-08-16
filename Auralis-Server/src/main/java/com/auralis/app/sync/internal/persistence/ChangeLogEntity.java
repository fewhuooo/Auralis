package com.auralis.app.sync.internal.persistence;

import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "change_log")
public class ChangeLogEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private long cursor;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 32)
    private SyncResourceType resourceType;

    @Column(name = "resource_id", nullable = false)
    private UUID resourceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "mutation_type", nullable = false, length = 16)
    private SyncMutationType mutationType;

    @Column(nullable = false)
    private long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ChangeLogEntity() {
    }

    public ChangeLogEntity(
            UUID id,
            UUID userId,
            long cursor,
            SyncResourceType resourceType,
            UUID resourceId,
            SyncMutationType mutationType,
            long version,
            Instant deletedAt,
            String payload) {
        this.id = id;
        this.userId = userId;
        this.cursor = cursor;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.mutationType = mutationType;
        this.version = version;
        this.deletedAt = deletedAt;
        this.payload = payload;
    }

    @PrePersist
    void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public long getCursor() { return cursor; }
    public SyncResourceType getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public SyncMutationType getMutationType() { return mutationType; }
    public long getVersion() { return version; }
    public Instant getDeletedAt() { return deletedAt; }
    public String getPayload() { return payload; }
    public Instant getCreatedAt() { return createdAt; }
}
