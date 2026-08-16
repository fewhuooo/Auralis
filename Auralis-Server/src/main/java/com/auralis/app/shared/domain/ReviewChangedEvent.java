package com.auralis.app.shared.domain;

import java.time.Instant;
import java.util.UUID;

public record ReviewChangedEvent(
        UUID userId,
        UUID knowledgeBlockId,
        long stateVersion,
        Instant occurredAt) {
}
