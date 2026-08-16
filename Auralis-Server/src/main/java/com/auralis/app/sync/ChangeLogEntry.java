package com.auralis.app.sync;

import java.time.Instant;
import java.util.UUID;

public record ChangeLogEntry(
        UUID id,
        UUID userId,
        long cursor,
        SyncResourceType resourceType,
        UUID resourceId,
        SyncMutationType mutationType,
        long version,
        Instant deletedAt,
        String payload,
        Instant createdAt) {
}
