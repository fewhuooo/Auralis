package com.auralis.app.focus.internal.persistence;

import com.auralis.app.focus.FocusSessionCommand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Entity
@Table(name = "focus_sessions")
public class FocusSessionEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "client_session_id", nullable = false)
    private UUID clientSessionId;

    @Column(name = "task_id")
    private UUID taskId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at", nullable = false)
    private Instant endedAt;

    @Column(name = "duration_seconds", nullable = false)
    private int durationSeconds;

    @Column(nullable = false)
    private boolean completed;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected FocusSessionEntity() {
    }

    public FocusSessionEntity(UUID id, UUID userId, FocusSessionCommand command) {
        this.id = id;
        this.userId = userId;
        this.clientSessionId = command.clientSessionId();
        this.taskId = command.taskId();
        this.startedAt = command.startedAt().truncatedTo(ChronoUnit.MICROS);
        this.endedAt = command.endedAt().truncatedTo(ChronoUnit.MICROS);
        this.durationSeconds = command.durationSeconds();
        this.completed = command.completed();
    }

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getClientSessionId() { return clientSessionId; }
    public UUID getTaskId() { return taskId; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getEndedAt() { return endedAt; }
    public int getDurationSeconds() { return durationSeconds; }
    public boolean isCompleted() { return completed; }
    public Instant getCreatedAt() { return createdAt; }

    public boolean hasSamePayload(FocusSessionCommand command) {
        return java.util.Objects.equals(taskId, command.taskId())
                && startedAt.equals(command.startedAt().truncatedTo(ChronoUnit.MICROS))
                && endedAt.equals(command.endedAt().truncatedTo(ChronoUnit.MICROS))
                && durationSeconds == command.durationSeconds()
                && completed == command.completed();
    }
}
