package com.auralis.app.shared.domain;

import java.time.Instant;
import java.util.UUID;

public record ResourceChangedEvent(
        UUID userId,
        ResourceType resourceType,
        UUID resourceId,
        String mutationType,
        long version,
        Instant deletedAt,
        Object payload) {
}
