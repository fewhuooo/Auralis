package com.auralis.app.realtime;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public final class RealtimeDtos {
    private RealtimeDtos() { }

    public record TicketRequest(@NotNull UUID deviceId) {
    }

    public record TicketResponse(String ticket, java.time.Instant expiresAt, String websocketUrl) {
        public static TicketResponse from(RealtimeTicket ticket) {
            return new TicketResponse(ticket.ticket(), ticket.expiresAt(), ticket.websocketUrl());
        }
    }
}
