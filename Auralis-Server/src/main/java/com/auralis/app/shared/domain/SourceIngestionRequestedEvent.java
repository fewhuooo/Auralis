package com.auralis.app.shared.domain;

import java.util.UUID;

public record SourceIngestionRequestedEvent(UUID userId, UUID sourceId, long sourceVersion) {
}
