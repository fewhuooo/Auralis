package com.auralis.app.review.internal.persistence;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_parameter_sets")
public class ReviewParameterSetEntity {
    @Id
    private UUID id;
    private String scheduler;
    private int version;
    private String parameters;
    private Instant createdAt;

    protected ReviewParameterSetEntity() {
    }

    public ReviewParameterSetEntity(UUID id, String scheduler, int version, String parameters) {
        this.id = id;
        this.scheduler = scheduler;
        this.version = version;
        this.parameters = parameters;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getScheduler() { return scheduler; }
    public int getVersion() { return version; }
    public String getParameters() { return parameters; }
    public Instant getCreatedAt() { return createdAt; }
}
