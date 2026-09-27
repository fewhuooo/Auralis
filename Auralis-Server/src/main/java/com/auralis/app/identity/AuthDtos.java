package com.auralis.app.identity;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 64) String username,
            @NotBlank @Size(min = 12, max = 200) String password,
            @NotBlank @Size(max = 120) String displayName,
            @NotBlank @Size(max = 128) String clientDeviceKey,
            @NotBlank @Size(max = 120) String deviceName,
            @NotNull DevicePlatform platform
    ) {
        DeviceCommand device() {
            return new DeviceCommand(clientDeviceKey, deviceName, platform);
        }
    }

    public record LoginRequest(
            @NotBlank @Size(max = 64) String username,
            @NotBlank String password,
            @NotBlank @Size(max = 128) String clientDeviceKey,
            @NotBlank @Size(max = 120) String deviceName,
            @NotNull DevicePlatform platform
    ) {
        DeviceCommand device() {
            return new DeviceCommand(clientDeviceKey, deviceName, platform);
        }
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record ProfileUpdateRequest(
            @NotNull @PositiveOrZero Long baseVersion,
            @NotBlank @Size(max = 120) String displayName) {
    }

    public record PasswordChangeRequest(
            @NotNull @PositiveOrZero Long baseVersion,
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 12, max = 200) String newPassword) {
    }

    public record AccountDeletionRequest(@NotBlank String password) {
    }

    public record AccountDeletionResponse(UUID id, String status, Instant requestedAt) {
    }

    public record SessionListResponse(List<SessionResponse> items, String nextCursor, boolean hasMore) {
        public SessionListResponse {
            items = List.copyOf(items);
        }
    }

    public record SessionResponse(
            UUID id,
            UUID serverDeviceId,
            String deviceName,
            DevicePlatform platform,
            Instant createdAt,
            Instant lastUsedAt,
            Instant expiresAt,
            Instant revokedAt,
            boolean current
    ) {
        static SessionResponse from(SessionView session) {
            return new SessionResponse(
                    session.id(),
                    session.serverDeviceId(),
                    session.deviceName(),
                    session.platform(),
                    session.createdAt(),
                    session.lastUsedAt(),
                    session.expiresAt(),
                    session.revokedAt(),
                    session.current());
        }
    }
}
