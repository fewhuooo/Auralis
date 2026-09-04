package com.auralis.app.sync.internal.persistence;

import com.auralis.app.sync.MutationDecision;
import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Entity
@Table(name = "inbound_mutations")
public class InboundMutationEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "device_id", nullable = false)
    private UUID serverDeviceId;

    @Column(name = "client_mutation_id", nullable = false, length = 128)
    private String clientMutationId;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private MutationDecision decision;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 32)
    private SyncResourceType resourceType;

    @Column(name = "resource_id", nullable = false)
    private UUID resourceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "mutation_type", nullable = false, length = 16)
    private SyncMutationType mutationType;

    @Column(name = "change_cursor")
    private Long changeCursor;

    @Column(name = "current_payload", columnDefinition = "TEXT")
    private String currentPayload;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected InboundMutationEntity() {
    }

    public InboundMutationEntity(
            UUID id,
            UUID userId,
            UUID serverDeviceId,
            String clientMutationId,
            String requestHash,
            MutationDecision decision,
            SyncResourceType resourceType,
            UUID resourceId,
            SyncMutationType mutationType,
            Long changeCursor,
            String currentPayload,
            String errorCode) {
        this.id = id;
        this.userId = userId;
        this.serverDeviceId = serverDeviceId;
        this.clientMutationId = clientMutationId;
        this.requestHash = requestHash;
        this.decision = decision;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.mutationType = mutationType;
        this.changeCursor = changeCursor;
        this.currentPayload = currentPayload;
        this.errorCode = errorCode;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = now.truncatedTo(ChronoUnit.MICROS);
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getServerDeviceId() { return serverDeviceId; }
    public String getClientMutationId() { return clientMutationId; }
    public String getRequestHash() { return requestHash; }
    public MutationDecision getDecision() { return decision; }
    public SyncResourceType getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public SyncMutationType getMutationType() { return mutationType; }
    public Long getChangeCursor() { return changeCursor; }
    public String getCurrentPayload() { return currentPayload; }
    public String getErrorCode() { return errorCode; }
    public Instant getCreatedAt() { return createdAt; }

    public void complete(MutationDecision decision, Long changeCursor, String currentPayload, String errorCode) {
        this.decision = decision;
        this.changeCursor = changeCursor;
        this.currentPayload = currentPayload;
        this.errorCode = errorCode;
    }
}
