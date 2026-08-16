package com.auralis.app.shared.domain;

import java.time.Instant;
import java.util.UUID;

public record ResourceChangeRecordedEvent(
        UUID userId,
        ResourceType resourceType,
        UUID resourceId,
        long version,
        long cursor,
        Instant occurredAt) {
}
