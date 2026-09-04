package com.auralis.app.realtime;

import java.util.UUID;

public record RealtimeSubscription(UUID userId, UUID serverDeviceId) {
}
