package com.auralis.app.identity.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_sessions")
public class RefreshSessionEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "device_id", nullable = false)
    private UUID serverDeviceId;

    @Column(name = "rotation_family_id", nullable = false)
    private UUID rotationFamilyId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 128)
    private String tokenHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "rotated_at")
    private Instant rotatedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "replaced_by_session_id")
    private UUID replacedBySessionId;

    protected RefreshSessionEntity() {
    }

    public RefreshSessionEntity(
            UUID id,
            UUID userId,
            UUID serverDeviceId,
            UUID rotationFamilyId,
            String tokenHash,
            Instant createdAt,
            Instant expiresAt) {
        this.id = id;
        this.userId = userId;
        this.serverDeviceId = serverDeviceId;
        this.rotationFamilyId = rotationFamilyId;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.lastUsedAt = createdAt;
    }

    @PrePersist
    void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (lastUsedAt == null) {
            lastUsedAt = createdAt;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getServerDeviceId() {
        return serverDeviceId;
    }

    public UUID getRotationFamilyId() {
        return rotationFamilyId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public Instant getRotatedAt() {
        return rotatedAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public UUID getReplacedBySessionId() {
        return replacedBySessionId;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public boolean isRotatedOrRevoked() {
        return rotatedAt != null || revokedAt != null;
    }

    public void markRotated(Instant at, UUID replacementId) {
        rotatedAt = at;
        lastUsedAt = at;
        replacedBySessionId = replacementId;
    }

    public void markUsed(Instant at) {
        lastUsedAt = at;
    }

    public void revoke(Instant at) {
        revokedAt = at;
    }
}
