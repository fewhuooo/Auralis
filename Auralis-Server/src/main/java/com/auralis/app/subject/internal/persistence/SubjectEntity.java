package com.auralis.app.subject.internal.persistence;

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
@Table(name = "subjects")
public class SubjectEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 2000)
    private String description;

    @Column(name = "icon_key", length = 64)
    private String iconKey;

    @Column(name = "sort_key", nullable = false, length = 128)
    private String sortKey;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected SubjectEntity() {
    }

    public SubjectEntity(
            UUID id,
            UUID userId,
            String name,
            String description,
            String iconKey,
            String sortKey) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.description = description;
        this.iconKey = iconKey;
        this.sortKey = sortKey;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (sortKey == null) {
            sortKey = "";
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
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getIconKey() { return iconKey; }
    public String getSortKey() { return sortKey; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }

    public void update(String name, String description, String iconKey, String sortKey) {
        this.name = name;
        this.description = description;
        this.iconKey = iconKey;
        this.sortKey = sortKey == null ? "" : sortKey;
    }

    public void softDelete() { deletedAt = Instant.now(); }
    public void restore() { deletedAt = null; }
}
