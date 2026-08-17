package com.auralis.app.identity;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import com.auralis.app.shared.security.AuthenticatedUser;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.NO_CONTENT;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final IdentityService identityService;

    public AuthController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @PostMapping("/register")
    @ResponseStatus(CREATED)
    public ResponseEntity<AuthResult> register(@Valid @RequestBody AuthDtos.RegisterRequest request) {
        AuthResult result = identityService.register(
                request.username(),
                request.password(),
                request.displayName(),
                request.device());
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/auth/sessions/" + result.sessionId()))
                .body(result);
    }

    @PostMapping("/login")
    public AuthResult login(@Valid @RequestBody AuthDtos.LoginRequest request) {
        return identityService.login(
                request.username(),
                request.password(),
                request.device());
    }

    @PostMapping("/refresh")
    public AuthResult refresh(@Valid @RequestBody AuthDtos.RefreshRequest request) {
        return identityService.refresh(request.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(NO_CONTENT)
    public void logout(@AuthenticationPrincipal AuthenticatedUser principal) {
        identityService.logout(principal.userId(), principal.sessionId());
    }

    @GetMapping("/me")
    public UserView me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return identityService.currentUser(principal.userId());
    }

    @GetMapping("/sessions")
    public AuthDtos.SessionListResponse sessions(@AuthenticationPrincipal AuthenticatedUser principal) {
        return new AuthDtos.SessionListResponse(
                identityService.listSessions(principal.userId(), principal.sessionId()).stream()
                        .map(AuthDtos.SessionResponse::from)
                        .toList(),
                null,
                false);
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(NO_CONTENT)
    public void revokeSession(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID sessionId) {
        identityService.revokeSession(principal.userId(), sessionId);
    }

    @DeleteMapping("/sessions/others")
    @ResponseStatus(NO_CONTENT)
    public void revokeOtherSessions(@AuthenticationPrincipal AuthenticatedUser principal) {
        identityService.revokeOtherSessions(principal.userId(), principal.sessionId());
    }
}
