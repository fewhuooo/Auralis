package com.auralis.app.identity;

import java.time.Instant;
import java.util.UUID;

public record SessionView(
        UUID id,
        UUID serverDeviceId,
        String deviceName,
        DevicePlatform platform,
        Instant createdAt,
        Instant lastUsedAt,
        Instant expiresAt,
        Instant revokedAt,
        boolean current
) {
}
