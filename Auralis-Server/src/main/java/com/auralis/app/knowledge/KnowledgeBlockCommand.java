package com.auralis.app.knowledge;

import java.util.UUID;

public record KnowledgeBlockCommand(
        UUID subjectId,
        UUID sourceId,
        String title,
        String content,
        String colorOverride) {
}
