package com.auralis.app.realtime;

import com.auralis.app.shared.security.AuthenticatedUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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
            @AuthenticationPrincipal AuthenticatedUser user) {
        var ticket = realtimeService.issue(user.userId(), user.serverDeviceId());
        return ResponseEntity.created(URI.create("/api/realtime/ticket"))
                .body(RealtimeDtos.TicketResponse.from(ticket));
    }

}
