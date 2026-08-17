package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "source_chunks", uniqueConstraints = @UniqueConstraint(
        name = "uq_source_chunks_user_source_generation_ordinal",
        columnNames = {"user_id", "source_id", "generation", "ordinal"}))
public class SourceChunkEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "source_id", nullable = false)
    private UUID sourceId;

    @Column(nullable = false)
    private UUID generation;

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private int ordinal;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(name = "char_start", nullable = false)
    private int charStart;

    @Column(name = "char_end", nullable = false)
    private int charEnd;

    @Column(name = "embedding_json", nullable = false, columnDefinition = "TEXT")
    private String embeddingJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SourceChunkEntity() {
    }

    public SourceChunkEntity(
            UUID id,
            UUID userId,
            UUID sourceId,
            int ordinal,
            String content,
            String contentHash,
            int charStart,
            int charEnd,
            String embeddingJson) {
        this(id, userId, sourceId, ordinal, content, contentHash, charStart, charEnd,
                embeddingJson, new UUID(0, 0), true);
    }

    public SourceChunkEntity(
            UUID id,
            UUID userId,
            UUID sourceId,
            int ordinal,
            String content,
            String contentHash,
            int charStart,
            int charEnd,
            String embeddingJson,
            UUID generation,
            boolean active) {
        this.id = id;
        this.userId = userId;
        this.sourceId = sourceId;
        this.generation = generation;
        this.active = active;
        this.ordinal = ordinal;
        this.content = content;
        this.contentHash = contentHash;
        this.charStart = charStart;
        this.charEnd = charEnd;
        this.embeddingJson = embeddingJson;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
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
    public UUID getSourceId() { return sourceId; }
    public UUID getGeneration() { return generation; }
    public boolean isActive() { return active; }
    public int getOrdinal() { return ordinal; }
    public String getContent() { return content; }
    public String getContentHash() { return contentHash; }
    public int getCharStart() { return charStart; }
    public int getCharEnd() { return charEnd; }
    public String getEmbeddingJson() { return embeddingJson; }
}
