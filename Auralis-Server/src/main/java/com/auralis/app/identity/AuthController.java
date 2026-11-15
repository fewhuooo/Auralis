package com.auralis.app.identity;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
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
                request.email(),
                request.emailCode(),
                request.password(),
                request.device());
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/auth/sessions/" + result.sessionId()))
                .body(result);
    }

    @PostMapping("/register/email-code")
    @ResponseStatus(NO_CONTENT)
    public void sendRegistrationCode(@Valid @RequestBody AuthDtos.EmailCodeRequest request) {
        identityService.sendRegistrationCode(request.email());
    }

    @PostMapping("/password/reset/email-code")
    @ResponseStatus(NO_CONTENT)
    public void sendPasswordResetCode(@Valid @RequestBody AuthDtos.EmailCodeRequest request) {
        identityService.sendPasswordResetCode(request.email());
    }

    @PostMapping("/password/reset")
    @ResponseStatus(NO_CONTENT)
    public void resetPassword(@Valid @RequestBody AuthDtos.PasswordResetRequest request) {
        identityService.resetPassword(request.email(), request.emailCode(), request.newPassword());
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

    @PutMapping("/me")
    public UserView updateProfile(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AuthDtos.ProfileUpdateRequest request) {
        return identityService.updateDisplayName(principal.userId(), request.baseVersion(), request.displayName());
    }

    @PutMapping("/password")
    @ResponseStatus(NO_CONTENT)
    public void changePassword(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AuthDtos.PasswordChangeRequest request) {
        identityService.changePassword(
                principal.userId(), principal.serverDeviceId(), request.baseVersion(),
                request.currentPassword(), request.newPassword());
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(NO_CONTENT)
    public void uploadAvatar(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam("file") MultipartFile file) {
        if (file == null || file.getSize() > 5 * 1024 * 1024) {
            throw new IdentityException("UPLOAD_VALIDATION_FAILED", "Avatar must be an image no larger than 5 MiB");
        }
        try {
            identityService.putAvatar(principal.userId(), file.getBytes());
        } catch (java.io.IOException exception) {
            throw new IdentityException("UPLOAD_VALIDATION_FAILED", "Avatar could not be read");
        }
    }

    @GetMapping(value = "/me/avatar", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> avatar(@AuthenticationPrincipal AuthenticatedUser principal) {
        IdentityService.AvatarContent avatar = identityService.getAvatar(principal.userId());
        if (avatar == null) {
            throw new IdentityException("RESOURCE_NOT_FOUND", "Avatar was not found");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(avatar.contentType()))
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(avatar.bytes());
    }

    @DeleteMapping("/me/avatar")
    @ResponseStatus(NO_CONTENT)
    public void resetAvatar(@AuthenticationPrincipal AuthenticatedUser principal) {
        identityService.resetAvatar(principal.userId());
    }

    @DeleteMapping("/me")
    @ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED)
    public AuthDtos.AccountDeletionResponse deleteAccount(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AuthDtos.AccountDeletionRequest request) {
        return identityService.requestAccountDeletion(principal.userId(), request.password());
    }

    @GetMapping("/sessions")
    public AuthDtos.SessionListResponse sessions(@AuthenticationPrincipal AuthenticatedUser principal) {
        return new AuthDtos.SessionListResponse(
                identityService.listSessions(principal.userId(), principal.serverDeviceId()).stream()
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
        identityService.revokeOtherSessions(principal.userId(), principal.serverDeviceId());
    }
}
