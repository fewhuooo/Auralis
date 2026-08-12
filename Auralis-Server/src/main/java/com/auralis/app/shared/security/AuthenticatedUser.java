package com.auralis.app.shared.security;

import java.util.UUID;

public record AuthenticatedUser(UUID userId, UUID sessionId, UUID deviceId) {
}
