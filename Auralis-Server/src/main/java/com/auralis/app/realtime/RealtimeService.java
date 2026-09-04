package com.auralis.app.realtime;

import com.auralis.app.identity.IdentityService;
import com.auralis.app.realtime.internal.persistence.RealtimeTicketEntity;
import com.auralis.app.realtime.internal.persistence.RealtimeTicketRepository;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class RealtimeService {
    private static final Duration TICKET_TTL = Duration.ofMinutes(5);
    private final RealtimeTicketRepository ticketRepository;
    private final IdentityService identityService;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    public RealtimeService(RealtimeTicketRepository ticketRepository, IdentityService identityService, Clock clock) {
        this.ticketRepository = ticketRepository;
        this.identityService = identityService;
        this.clock = clock;
    }

    @Transactional
    public RealtimeTicket issue(UUID userId, UUID serverDeviceId) {
        identityService.requireActiveDevice(userId, serverDeviceId);
        byte[] rawBytes = new byte[32];
        secureRandom.nextBytes(rawBytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(rawBytes);
        Instant expiresAt = clock.instant().plus(TICKET_TTL);
        ticketRepository.save(new RealtimeTicketEntity(UUID.randomUUID(), userId, serverDeviceId, hash(raw), expiresAt));
        return new RealtimeTicket(raw, expiresAt, "/ws/events?ticket=" + raw);
    }

    @Transactional
    public RealtimeSubscription consume(UUID userId, String rawTicket) {
        if (rawTicket == null || rawTicket.isBlank()) {
            throw invalidTicket();
        }
        RealtimeTicketEntity ticket = ticketRepository.findByTicketHash(hash(rawTicket))
                .orElseThrow(this::invalidTicket);
        Instant now = clock.instant();
        if (!ticket.getUserId().equals(userId) || ticket.getConsumedAt() != null || !ticket.getExpiresAt().isAfter(now)) {
            throw invalidTicket();
        }
        ticket.consume(now);
        ticketRepository.saveAndFlush(ticket);
        return new RealtimeSubscription(ticket.getUserId(), ticket.getServerDeviceId());
    }

    @Transactional
    public RealtimeSubscription consume(String rawTicket) {
        if (rawTicket == null || rawTicket.isBlank()) {
            throw invalidTicket();
        }
        RealtimeTicketEntity ticket = ticketRepository.findByTicketHash(hash(rawTicket))
                .orElseThrow(this::invalidTicket);
        return consume(ticket.getUserId(), rawTicket);
    }

    public String hashForStorage(String rawTicket) {
        return hash(rawTicket);
    }

    private DomainException invalidTicket() {
        return new DomainException("UNAUTHENTICATED", "Realtime ticket is invalid");
    }

    private String hash(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte value : digest) {
                result.append(String.format("%02x", value));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
