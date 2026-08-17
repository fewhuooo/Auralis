package com.auralis.app.realtime;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

import static org.springframework.http.HttpStatus.CREATED;

@RestController
public class RealtimeController {
    private final RealtimeService realtimeService;

    public RealtimeController(RealtimeService realtimeService) {
        this.realtimeService = realtimeService;
    }

    @PostMapping("/api/realtime/ticket")
    @ResponseStatus(CREATED)
    public ResponseEntity<RealtimeDtos.TicketResponse> issue(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody RealtimeDtos.TicketRequest request) {
        var ticket = realtimeService.issue(user.userId(), request.deviceId());
        return ResponseEntity.created(URI.create("/api/realtime/ticket"))
                .body(RealtimeDtos.TicketResponse.from(ticket));
    }

    /**
     * HTTP fallback for environments without the optional WebSocket starter.
     * A real WebSocket adapter can call the same consume operation before registering a subscriber.
     */
    @GetMapping("/ws/events")
    public RealtimeSubscription handshake(@RequestParam(required = false) String ticket,
                                          @RequestHeader(value = "X-Realtime-Ticket", required = false) String headerTicket,
                                          @AuthenticationPrincipal AuthenticatedUser user) {
        return realtimeService.consume(user.userId(), ticket == null ? headerTicket : ticket);
    }
}
