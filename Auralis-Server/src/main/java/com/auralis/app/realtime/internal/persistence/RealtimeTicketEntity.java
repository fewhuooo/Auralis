package com.auralis.app.realtime.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "realtime_tickets")
public class RealtimeTicketEntity {
    @Id
    private UUID id;
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    @Column(name = "device_id", nullable = false)
    private UUID deviceId;
    @Column(name = "ticket_hash", nullable = false, length = 128)
    private String ticketHash;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Column(name = "consumed_at")
    private Instant consumedAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected RealtimeTicketEntity() {
    }

    public RealtimeTicketEntity(UUID id, UUID userId, UUID deviceId, String ticketHash, Instant expiresAt) {
        this.id = id;
        this.userId = userId;
        this.deviceId = deviceId;
        this.ticketHash = ticketHash;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getDeviceId() { return deviceId; }
    public String getTicketHash() { return ticketHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getConsumedAt() { return consumedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void consume(Instant at) { this.consumedAt = at; }
}
