package com.auralis.app.relation;

import java.time.Instant;
import java.util.UUID;

public record RelationView(
        UUID id,
        RelationNodeType sourceType,
        UUID sourceId,
        RelationNodeType targetType,
        UUID targetId,
        RelationType type,
        String label,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt) {
}
