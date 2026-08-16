package com.auralis.app.shared.domain;

import java.util.UUID;

public record ResourceDeletedEvent(UUID userId, ResourceType resourceType, UUID resourceId) {
}
