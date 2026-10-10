package com.auralis.app.focus;

import java.time.Instant;
import java.util.UUID;

public record FocusSessionView(
        UUID id,
        UUID clientSessionId,
        UUID taskId,
        Instant startedAt,
        Instant endedAt,
        int durationSeconds,
        boolean completed,
        Instant createdAt) {
}
