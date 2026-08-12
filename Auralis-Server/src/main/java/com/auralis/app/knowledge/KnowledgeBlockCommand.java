package com.auralis.app.knowledge;

import java.util.List;
import java.util.UUID;

public record KnowledgeBlockCommand(
        UUID subjectId,
        UUID sourceId,
        String title,
        String summary,
        String content,
        List<String> tags,
        String colorOverride) {
}
