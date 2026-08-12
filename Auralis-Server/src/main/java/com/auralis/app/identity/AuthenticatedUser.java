package com.auralis.app.identity;

import java.util.UUID;

public record AuthenticatedUser(UUID userId, UUID sessionId, UUID deviceId) {
}
