package com.auralis.app.knowledge.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "knowledge_blocks")
public class KnowledgeBlockEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;

    @Column(name = "source_id")
    private UUID sourceId;

    @Column(nullable = false, length = 240)
    private String title;

    @Column(length = 4000)
    private String summary;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String tags;

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

    protected KnowledgeBlockEntity() {
    }

    public KnowledgeBlockEntity(
            UUID id,
            UUID userId,
            UUID subjectId,
            UUID sourceId,
            String title,
            String summary,
            String content,
            String tags,
            String colorOverride) {
        this.id = id;
        this.userId = userId;
        this.subjectId = subjectId;
        this.sourceId = sourceId;
        this.title = title;
        this.summary = summary;
        this.content = content;
        this.tags = tags;
        this.colorOverride = colorOverride;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (tags == null) {
            tags = "[]";
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
    public UUID getSourceId() { return sourceId; }
    public String getTitle() { return title; }
    public String getSummary() { return summary; }
    public String getContent() { return content; }
    public String getTags() { return tags; }
    public String getColorOverride() { return colorOverride; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }

    public void update(UUID subjectId, UUID sourceId, String title, String summary, String content, String tags, String colorOverride) {
        this.subjectId = subjectId;
        this.sourceId = sourceId;
        this.title = title;
        this.summary = summary;
        this.content = content;
        this.tags = tags == null ? "[]" : tags;
        this.colorOverride = colorOverride;
    }

    public void softDelete() { deletedAt = Instant.now(); }
    public void restore() { deletedAt = null; }
}
