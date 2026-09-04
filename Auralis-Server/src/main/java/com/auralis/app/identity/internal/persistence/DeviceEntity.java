package com.auralis.app.identity.internal.persistence;

import com.auralis.app.identity.DevicePlatform;
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
@Table(name = "devices")
public class DeviceEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "device_id", nullable = false, length = 128)
    private String clientDeviceKey;

    @Column(length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private DevicePlatform platform;

    @Column(name = "last_active_at", nullable = false)
    private Instant lastActiveAt;

    @Column(name = "last_pull_cursor", nullable = false)
    private long lastPullCursor;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DeviceEntity() {
    }

    public DeviceEntity(UUID id, UUID userId, String clientDeviceKey, String name, DevicePlatform platform) {
        this.id = id;
        this.userId = userId;
        this.clientDeviceKey = clientDeviceKey;
        this.name = name;
        this.platform = platform;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (lastActiveAt == null) {
            lastActiveAt = now;
        }
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getClientDeviceKey() {
        return clientDeviceKey;
    }

    public String getName() {
        return name;
    }

    public DevicePlatform getPlatform() {
        return platform;
    }

    public Instant getLastActiveAt() {
        return lastActiveAt;
    }

    public long getLastPullCursor() {
        return lastPullCursor;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void markActive(Instant at) {
        lastActiveAt = at;
        revokedAt = null;
    }

    public void revoke(Instant at) {
        revokedAt = at;
    }
}
