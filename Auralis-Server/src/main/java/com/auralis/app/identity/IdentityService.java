package com.auralis.app.identity;

import com.auralis.app.identity.internal.persistence.DeviceEntity;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionEntity;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserEntity;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.identity.internal.security.RefreshTokenHasher;
import com.auralis.app.identity.internal.security.TokenService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class IdentityService {

    private static final String INVALID_CREDENTIALS_CODE = "UNAUTHENTICATED";
    private static final String INVALID_CREDENTIALS_MESSAGE = "Invalid credentials";

    private final UserRepository userRepository;
    private final DeviceRepository deviceRepository;
    private final RefreshSessionRepository refreshSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final RefreshTokenHasher refreshTokenHasher;
    private final Clock clock;

    public IdentityService(
            UserRepository userRepository,
            DeviceRepository deviceRepository,
            RefreshSessionRepository refreshSessionRepository,
            PasswordEncoder passwordEncoder,
            TokenService tokenService,
            RefreshTokenHasher refreshTokenHasher,
            Clock clock) {
        this.userRepository = userRepository;
        this.deviceRepository = deviceRepository;
        this.refreshSessionRepository = refreshSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.refreshTokenHasher = refreshTokenHasher;
        this.clock = clock;
    }

    @Transactional
    public AuthResult register(String username, String password, String displayName, DeviceCommand device) {
        String normalizedUsername = normalizeUsername(username);
        if (userRepository.findByNormalizedUsername(normalizedUsername).isPresent()) {
            throw new IdentityException("MUTATION_REJECTED", "Username is already registered");
        }
        UserEntity user = userRepository.save(new UserEntity(
                UUID.randomUUID(),
                username.trim(),
                normalizedUsername,
                passwordEncoder.encode(password),
                displayName,
                null,
                UserStatus.ACTIVE));
        return issueForUser(user, device);
    }

    @Transactional
    public AuthResult login(String username, String password, DeviceCommand device) {
        UserEntity user = userRepository.findByNormalizedUsername(normalizeUsername(username)).orElse(null);
        if (user == null || user.getStatus() != UserStatus.ACTIVE
                || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw invalidCredentials();
        }
        return issueForUser(user, device);
    }

    @Transactional(noRollbackFor = IdentityException.class)
    public AuthResult refresh(String rawRefreshToken) {
        Instant now = clock.instant();
        String tokenHash = refreshTokenHasher.hash(rawRefreshToken);
        RefreshSessionEntity current = refreshSessionRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(this::invalidCredentials);
        if (current.isRotatedOrRevoked()) {
            refreshSessionRepository.revokeFamily(current.getRotationFamilyId(), now);
            throw invalidCredentials();
        }
        if (current.isExpired(now)) {
            current.revoke(now);
            throw invalidCredentials();
        }
        UserEntity user = userRepository.findById(current.getUserId()).orElseThrow(this::invalidCredentials);
        DeviceEntity device = deviceRepository.findById(current.getDeviceId()).orElseThrow(this::invalidCredentials);
        if (user.getStatus() != UserStatus.ACTIVE || device.getRevokedAt() != null) {
            throw invalidCredentials();
        }
        String nextRefreshToken = tokenService.newRefreshToken();
        UUID nextSessionId = UUID.randomUUID();
        RefreshSessionEntity replacement = new RefreshSessionEntity(
                nextSessionId,
                user.getId(),
                device.getId(),
                current.getRotationFamilyId(),
                refreshTokenHasher.hash(nextRefreshToken),
                now,
                now.plusSeconds(tokenService.requireIdentityProperties().refreshSessionTtlSeconds()));
        current.markRotated(now, nextSessionId);
        refreshSessionRepository.save(current);
        refreshSessionRepository.save(replacement);
        return new AuthResult(
                toUserView(user),
                tokenService.issueTokenPair(user.getId(), nextSessionId, device.getId(), now, nextRefreshToken),
                nextSessionId,
                device.getId());
    }

    @Transactional
    public void logout(UUID userId, UUID sessionId) {
        refreshSessionRepository.findByIdAndUserId(sessionId, userId)
                .ifPresent(session -> session.revoke(clock.instant()));
    }

    private AuthResult issueForUser(UserEntity user, DeviceCommand deviceCommand) {
        DeviceEntity device = deviceRepository.findByUserIdAndDeviceId(user.getId(), deviceCommand.deviceId())
                .map(existing -> {
                    existing.markActive(clock.instant());
                    return existing;
                })
                .orElseGet(() -> deviceRepository.save(new DeviceEntity(
                        UUID.randomUUID(),
                        user.getId(),
                        deviceCommand.deviceId(),
                        deviceCommand.name(),
                        deviceCommand.platform())));
        Instant now = clock.instant();
        String refreshToken = tokenService.newRefreshToken();
        UUID sessionId = UUID.randomUUID();
        RefreshSessionEntity session = refreshSessionRepository.save(new RefreshSessionEntity(
                sessionId,
                user.getId(),
                device.getId(),
                UUID.randomUUID(),
                refreshTokenHasher.hash(refreshToken),
                now,
                now.plusSeconds(tokenService.requireIdentityProperties().refreshSessionTtlSeconds())));
        return new AuthResult(
                toUserView(user),
                tokenService.issueTokenPair(user.getId(), session.getId(), device.getId(), now, refreshToken),
                session.getId(),
                device.getId());
    }

    private UserView toUserView(UserEntity user) {
        return new UserView(user.getId(), user.getUsername(), user.getDisplayName());
    }

    private String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new IdentityException("VALIDATION_FAILED", "Username is required");
        }
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private IdentityException invalidCredentials() {
        return new IdentityException(INVALID_CREDENTIALS_CODE, INVALID_CREDENTIALS_MESSAGE);
    }
}
