package com.auralis.app.realtime.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface RealtimeTicketRepository extends JpaRepository<RealtimeTicketEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RealtimeTicketEntity> findByTicketHash(String ticketHash);
}
