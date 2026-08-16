package com.auralis.app.realtime;

import java.time.Instant;
import java.util.UUID;

public record RealtimeEventView(
        RealtimeEventType type,
        String resourceType,
        UUID resourceId,
        long cursor,
        Instant occurredAt) {
}
