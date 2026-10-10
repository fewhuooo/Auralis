package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "overview_write_receipts")
public class OverviewWriteReceiptEntity {
    @Id
    private UUID id;
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    @Column(name = "client_write_id", nullable = false)
    private UUID clientWriteId;
    @Column(name = "scope_type", nullable = false, length = 16)
    private String scopeType;
    @Column(name = "scope_id", nullable = false)
    private UUID scopeId;
    @Column(name = "base_version", nullable = false)
    private long baseVersion;
    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;
    @Column(name = "response_snapshot", nullable = false, columnDefinition = "TEXT")
    private String responseSnapshot;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected OverviewWriteReceiptEntity() {
    }

    public OverviewWriteReceiptEntity(UUID id, UUID userId, UUID clientWriteId, String scopeType,
                                      UUID scopeId, long baseVersion, String payloadHash, String responseSnapshot) {
        this.id = id;
        this.userId = userId;
        this.clientWriteId = clientWriteId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.baseVersion = baseVersion;
        this.payloadHash = payloadHash;
        this.responseSnapshot = responseSnapshot;
    }

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getUserId() { return userId; }
    public UUID getClientWriteId() { return clientWriteId; }
    public String getScopeType() { return scopeType; }
    public UUID getScopeId() { return scopeId; }
    public long getBaseVersion() { return baseVersion; }
    public String getPayloadHash() { return payloadHash; }
    public String getResponseSnapshot() { return responseSnapshot; }
}
