package com.auralis.app.subject;

import java.time.Instant;
import java.util.UUID;

public record SubjectView(
        UUID id,
        String name,
        String description,
        String iconKey,
        String color,
        String sortKey,
        boolean defaultSubject,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt) {
}
