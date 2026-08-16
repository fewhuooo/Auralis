package com.auralis.app.task.internal.persistence;

import com.auralis.app.task.CognitiveLoad;
import com.auralis.app.task.TaskStatus;
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
@Table(name = "tasks")
public class TaskEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;

    @Column(nullable = false, length = 240)
    private String title;

    @Column(length = 4000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private TaskStatus status;

    @Column(name = "scheduled_at")
    private Instant scheduledAt;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    @Enumerated(EnumType.STRING)
    @Column(name = "cognitive_load", length = 16)
    private CognitiveLoad cognitiveLoad;

    @Column(name = "sort_key", nullable = false, length = 128)
    private String sortKey;

    @Column(name = "color_override", length = 32)
    private String colorOverride;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected TaskEntity() {
    }

    public TaskEntity(
            UUID id,
            UUID userId,
            UUID subjectId,
            String title,
            String description,
            TaskStatus status,
            Instant scheduledAt,
            Instant dueAt,
            Integer durationMinutes,
            CognitiveLoad cognitiveLoad,
            String sortKey,
            String colorOverride) {
        this.id = id;
        this.userId = userId;
        this.subjectId = subjectId;
        this.title = title;
        this.description = description;
        this.status = status;
        this.scheduledAt = scheduledAt;
        this.dueAt = dueAt;
        this.durationMinutes = durationMinutes;
        this.cognitiveLoad = cognitiveLoad;
        this.sortKey = sortKey;
        this.colorOverride = colorOverride;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (status == null) {
            status = TaskStatus.TODO;
        }
        if (sortKey == null) {
            sortKey = "";
        }
        if (status == TaskStatus.DONE && completedAt == null) {
            completedAt = now;
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
    public UUID getSubjectId() { return subjectId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public TaskStatus getStatus() { return status; }
    public Instant getScheduledAt() { return scheduledAt; }
    public Instant getDueAt() { return dueAt; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public CognitiveLoad getCognitiveLoad() { return cognitiveLoad; }
    public String getSortKey() { return sortKey; }
    public String getColorOverride() { return colorOverride; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }
    public Instant getCompletedAt() { return completedAt; }

    public void update(
            UUID subjectId,
            String title,
            String description,
            TaskStatus status,
            Instant scheduledAt,
            Instant dueAt,
            Integer durationMinutes,
            CognitiveLoad cognitiveLoad,
            String sortKey,
            String colorOverride) {
        this.subjectId = subjectId;
        this.title = title;
        this.description = description;
        TaskStatus previousStatus = this.status;
        this.status = status;
        if (status == TaskStatus.DONE && previousStatus != TaskStatus.DONE) {
            this.completedAt = Instant.now();
        } else if (status != TaskStatus.DONE) {
            this.completedAt = null;
        }
        this.scheduledAt = scheduledAt;
        this.dueAt = dueAt;
        this.durationMinutes = durationMinutes;
        this.cognitiveLoad = cognitiveLoad;
        this.sortKey = sortKey == null ? "" : sortKey;
        this.colorOverride = colorOverride;
    }

    public void softDelete() { deletedAt = Instant.now(); }
    public void restore() { deletedAt = null; }
}
