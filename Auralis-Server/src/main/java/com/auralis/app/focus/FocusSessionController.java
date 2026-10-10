package com.auralis.app.focus;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/focus-sessions")
public class FocusSessionController {
    private final FocusSessionService service;

    public FocusSessionController(FocusSessionService service) {
        this.service = service;
    }

    @PostMapping
    public FocusSessionView create(@AuthenticationPrincipal AuthenticatedUser user,
                                   @Valid @RequestBody FocusSessionCommand command) {
        return service.record(user.userId(), command);
    }
}
