package com.auralis.app.knowledge;

import java.time.Instant;
import java.util.UUID;

public record KnowledgeBlockView(
        UUID id,
        UUID subjectId,
        UUID sourceId,
        String title,
        String content,
        String colorOverride,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt) {
}
