package com.auralis.app.shared.domain;

import java.time.Instant;
import java.util.UUID;

public record OverviewResultChangedEvent(UUID userId, String scopeType, UUID scopeId,
                                         long version, Instant occurredAt) {
}
