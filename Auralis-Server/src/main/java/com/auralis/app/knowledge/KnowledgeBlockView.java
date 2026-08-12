package com.auralis.app.knowledge;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record KnowledgeBlockView(
        UUID id,
        UUID subjectId,
        UUID sourceId,
        String title,
        String summary,
        String content,
        List<String> tags,
        String colorOverride,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt) {
    public KnowledgeBlockView {
        tags = tags == null ? List.of() : List.copyOf(tags);
    }
}
