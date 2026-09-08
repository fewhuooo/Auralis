package com.auralis.app.task;

import java.time.Instant;
import java.util.UUID;

public record TaskCommand(
        UUID subjectId,
        String title,
        String description,
        TaskStatus status,
        Instant scheduledAt,
        Instant dueAt,
        Integer durationMinutes,
        String sortKey) {
}
