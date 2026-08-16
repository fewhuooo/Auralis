package com.auralis.app.realtime;

import java.time.Instant;

public record RealtimeTicket(String ticket, Instant expiresAt, String websocketUrl) {
}
