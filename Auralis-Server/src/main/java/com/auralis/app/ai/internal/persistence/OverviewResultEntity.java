package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "overview_results")
public class OverviewResultEntity {
    @Id
    private UUID id;
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    @Column(name = "scope_type", nullable = false, length = 16)
    private String scopeType;
    @Column(name = "scope_id", nullable = false)
    private UUID scopeId;
    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;
    @Column(name = "source_id")
    private UUID sourceId;
    @Column(name = "ingestion_revision")
    private UUID ingestionRevision;
    @Column(nullable = false)
    private long version;
    @Column(name = "outline_version", nullable = false)
    private long outlineVersion;
    @Column(name = "summary_version", nullable = false)
    private long summaryVersion;
    @Column(nullable = false, columnDefinition = "TEXT")
    private String title;
    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;
    @Column(columnDefinition = "TEXT")
    private String outline;
    @Column(columnDefinition = "TEXT")
    private String summary;
    @Column(name = "outline_identity_json", columnDefinition = "TEXT")
    private String outlineIdentityJson;
    @Column(name = "outline_source_manifest", columnDefinition = "TEXT")
    private String outlineSourceManifest;
    @Column(name = "summary_source_manifest", columnDefinition = "TEXT")
    private String summarySourceManifest;
    @Column(name = "outline_input_fingerprint", length = 64)
    private String outlineInputFingerprint;
    @Column(name = "summary_input_fingerprint", length = 64)
    private String summaryInputFingerprint;
    @Column(name = "outline_input_origin", length = 32)
    private String outlineInputOrigin;
    @Column(name = "summary_input_origin", length = 32)
    private String summaryInputOrigin;
    @Column(name = "outline_input_snapshot_json", columnDefinition = "TEXT")
    private String outlineInputSnapshotJson;
    @Column(name = "summary_input_snapshot_json", columnDefinition = "TEXT")
    private String summaryInputSnapshotJson;
    @Column(name = "outline_generated_at")
    private Instant outlineGeneratedAt;
    @Column(name = "summary_generated_at")
    private Instant summaryGeneratedAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected OverviewResultEntity() {
    }

    public OverviewResultEntity(UUID id, UUID userId, String scopeType, UUID scopeId, UUID subjectId,
                                UUID sourceId, UUID ingestionRevision) {
        this.id = id;
        this.userId = userId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.subjectId = subjectId;
        this.sourceId = sourceId;
        this.ingestionRevision = ingestionRevision;
    }

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    public void apply(String title, int schemaVersion, String outline, String summary,
                      String outlineSourceManifest, String summarySourceManifest,
                      String outlineInputFingerprint, String summaryInputFingerprint,
                      Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                      boolean updateOutline, boolean updateSummary, UUID ingestionRevision) {
        apply(title, schemaVersion, outline, summary, outlineIdentityJson,
                outlineSourceManifest, summarySourceManifest, outlineInputFingerprint, summaryInputFingerprint,
                outlineGeneratedAt, summaryGeneratedAt, updateOutline, updateSummary, ingestionRevision);
    }

    public void apply(String title, int schemaVersion, String outline, String summary, String outlineIdentityJson,
                      String outlineSourceManifest, String summarySourceManifest,
                      String outlineInputFingerprint, String summaryInputFingerprint,
                      Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                      boolean updateOutline, boolean updateSummary, UUID ingestionRevision) {
        this.title = title;
        this.schemaVersion = schemaVersion;
        if (updateOutline) {
            this.outline = outline;
            this.outlineIdentityJson = outlineIdentityJson;
            this.outlineSourceManifest = outlineSourceManifest;
            this.outlineInputFingerprint = outlineInputFingerprint;
            this.outlineGeneratedAt = outlineGeneratedAt;
            this.outlineVersion++;
        }
        if (updateSummary) {
            this.summary = summary;
            this.summarySourceManifest = summarySourceManifest;
            this.summaryInputFingerprint = summaryInputFingerprint;
            this.summaryGeneratedAt = summaryGeneratedAt;
            this.summaryVersion++;
        }
        this.ingestionRevision = ingestionRevision;
        this.version++;
        this.updatedAt = Instant.now();
    }

    public void applyInputDescriptors(String outlineOrigin, String outlineSnapshotJson,
                                      String summaryOrigin, String summarySnapshotJson,
                                      boolean updateOutline, boolean updateSummary) {
        if (updateOutline) {
            this.outlineInputOrigin = outlineOrigin;
            this.outlineInputSnapshotJson = outlineSnapshotJson;
        }
        if (updateSummary) {
            this.summaryInputOrigin = summaryOrigin;
            this.summaryInputSnapshotJson = summarySnapshotJson;
        }
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getScopeType() { return scopeType; }
    public UUID getScopeId() { return scopeId; }
    public UUID getSubjectId() { return subjectId; }
    public UUID getSourceId() { return sourceId; }
    public UUID getIngestionRevision() { return ingestionRevision; }
    public long getVersion() { return version; }
    public long getOutlineVersion() { return outlineVersion; }
    public long getSummaryVersion() { return summaryVersion; }
    public String getTitle() { return title; }
    public int getSchemaVersion() { return schemaVersion; }
    public String getOutline() { return outline; }
    public String getSummary() { return summary; }
    public String getOutlineIdentityJson() { return outlineIdentityJson; }
    public String getOutlineSourceManifest() { return outlineSourceManifest; }
    public String getSummarySourceManifest() { return summarySourceManifest; }
    public String getOutlineInputFingerprint() { return outlineInputFingerprint; }
    public String getSummaryInputFingerprint() { return summaryInputFingerprint; }
    public String getOutlineInputOrigin() { return outlineInputOrigin; }
    public String getSummaryInputOrigin() { return summaryInputOrigin; }
    public String getOutlineInputSnapshotJson() { return outlineInputSnapshotJson; }
    public String getSummaryInputSnapshotJson() { return summaryInputSnapshotJson; }
    public Instant getOutlineGeneratedAt() { return outlineGeneratedAt; }
    public Instant getSummaryGeneratedAt() { return summaryGeneratedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
