package com.auralis.app.identity;

import com.auralis.app.identity.internal.persistence.DeviceEntity;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionEntity;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserEntity;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.identity.internal.security.RefreshTokenHasher;
import com.auralis.app.identity.internal.security.TokenService;
import com.auralis.app.shared.error.DomainException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.concurrent.RejectedExecutionException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;

@Service
public class IdentityService {

    private static final Logger LOGGER = LoggerFactory.getLogger(IdentityService.class);
    private static final String INVALID_CREDENTIALS_CODE = "UNAUTHENTICATED";
    private static final String INVALID_CREDENTIALS_MESSAGE = "Invalid credentials";

    private final UserRepository userRepository;
    private final DeviceRepository deviceRepository;
    private final RefreshSessionRepository refreshSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final RefreshTokenHasher refreshTokenHasher;
    private final Clock clock;
    private final JdbcTemplate jdbcTemplate;
    private final long uploadIntentTtlSeconds;
    private final AuthEmailCodes emailCodes;
    private final AuthEmailDelivery emailDelivery;
    private final TaskExecutor authEmailExecutor;
    public IdentityService(
            UserRepository userRepository,
            DeviceRepository deviceRepository,
            RefreshSessionRepository refreshSessionRepository,
            PasswordEncoder passwordEncoder,
            TokenService tokenService,
            RefreshTokenHasher refreshTokenHasher,
            Clock clock,
            JdbcTemplate jdbcTemplate,
            AuthEmailCodes emailCodes,
            AuthEmailDelivery emailDelivery,
            @Qualifier("authEmailExecutor") TaskExecutor authEmailExecutor,
            @Value("${auralis.upload.storage.presign-ttl-seconds:300}") long uploadIntentTtlSeconds) {
        this.userRepository = userRepository;
        this.deviceRepository = deviceRepository;
        this.refreshSessionRepository = refreshSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.refreshTokenHasher = refreshTokenHasher;
        this.clock = clock;
        this.jdbcTemplate = jdbcTemplate;
        this.emailCodes = emailCodes;
        this.emailDelivery = emailDelivery;
        this.authEmailExecutor = authEmailExecutor;
        this.uploadIntentTtlSeconds = Math.max(0, uploadIntentTtlSeconds);
    }

    /**
     * Serializes mutations that enforce a user-wide invariant. Callers must acquire
     * this lock before Subject/resource locks and keep the surrounding transaction
     * open for the complete mutation.
     */
    @Transactional
    public void lockUserForScheduling(UUID userId) {
        userRepository.findForUpdateById(userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "User was not found"));
    }

    @Transactional
    public void lockActiveUserForStorage(UUID userId) {
        userRepository.findForUpdateById(userId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(this::unauthenticated);
    }

    public void sendRegistrationCode(String email) {
        queueEmailCode(normalizeEmail(email), AuthEmailCodes.Purpose.REGISTRATION);
    }

    public void sendPasswordResetCode(String email) {
        queueEmailCode(normalizeEmail(email), AuthEmailCodes.Purpose.PASSWORD_RESET);
    }

    @Transactional(noRollbackFor = InvalidEmailCodeException.class)
    public AuthResult register(
            String username, String email, String emailCode, String password, DeviceCommand device) {
        String normalizedUsername = normalizeUsername(username);
        String trimmedUsername = username.trim();
        String normalizedEmail = normalizeEmail(email);
        if (normalizedUsername.contains("@")) {
            throw new IdentityException("VALIDATION_FAILED", "Username must not contain @");
        }
        requirePasswordFitsEncoder(password);
        if (userRepository.findByNormalizedUsername(normalizedUsername).isPresent()) {
            throw new IdentityException("MUTATION_REJECTED", "Username is already registered");
        }
        emailCodes.consume(normalizedEmail, AuthEmailCodes.Purpose.REGISTRATION, emailCode);
        UserEntity user = new UserEntity(
                UUID.randomUUID(),
                trimmedUsername,
                normalizedUsername,
                passwordEncoder.encode(password),
                trimmedUsername,
                null,
                UserStatus.ACTIVE);
        user.setVerifiedEmail(normalizedEmail);
        UserEntity saved;
        try {
            saved = userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException exception) {
            throw new IdentityException("MUTATION_REJECTED", "Username or email is already registered");
        }
        return issueForUser(saved, device);
    }

    @Transactional(noRollbackFor = InvalidEmailCodeException.class)
    public void resetPassword(String email, String emailCode, String newPassword) {
        requirePasswordFitsEncoder(newPassword);
        String normalizedEmail = normalizeEmail(email);
        UserEntity user = userRepository.findForUpdateByEmail(normalizedEmail)
                .filter(found -> found.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(InvalidEmailCodeException::new);
        emailCodes.consume(normalizedEmail + ":" + user.getId(), AuthEmailCodes.Purpose.PASSWORD_RESET, emailCode);
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.incrementCredentialGeneration();
        refreshSessionRepository.revokeAllForUser(user.getId(), clock.instant());
    }

    @Transactional
    public AuthResult login(String username, String password, DeviceCommand device) {
        String identifier = normalizeUsername(username);
        UserEntity user = (identifier.contains("@")
                ? userRepository.findForUpdateByEmail(identifier)
                : userRepository.findForUpdateByNormalizedUsername(identifier)).orElse(null);
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
        UUID userId = refreshSessionRepository.findUserIdByTokenHash(tokenHash)
                .orElseThrow(this::invalidCredentials);
        UserEntity user = userRepository.findForUpdateById(userId)
                .filter(found -> found.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(this::invalidCredentials);
        RefreshSessionEntity current = refreshSessionRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(this::invalidCredentials);
        if (!userId.equals(current.getUserId())) {
            throw invalidCredentials();
        }
        if (current.isRotatedOrRevoked()) {
            refreshSessionRepository.revokeFamily(current.getRotationFamilyId(), now);
            throw invalidCredentials();
        }
        if (current.isExpired(now)) {
            current.revoke(now);
            throw invalidCredentials();
        }
        DeviceEntity device = deviceRepository.findById(current.getServerDeviceId()).orElseThrow(this::invalidCredentials);
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
                tokenService.issueTokenPair(user.getId(), nextSessionId, device.getId(), user.getCredentialGeneration(), now, nextRefreshToken),
                nextSessionId,
                device.getId());
    }

    @Transactional
    public void logout(UUID userId, UUID sessionId) {
        userRepository.findForUpdateById(userId);
        refreshSessionRepository.findByIdAndUserId(sessionId, userId)
                .ifPresent(session -> refreshSessionRepository.revokeFamily(session.getRotationFamilyId(), clock.instant()));
    }

    @Transactional(readOnly = true)
    public UserView currentUser(UUID userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(this::unauthenticated);
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw unauthenticated();
        }
        return toUserView(user);
    }

    @Transactional
    public UserView updateDisplayName(UUID userId, long baseVersion, String displayName) {
        UserEntity user = userRepository.findForUpdateById(userId)
                .filter(found -> found.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(this::unauthenticated);
        requireVersion(user, baseVersion);
        String normalizedDisplayName = displayName == null ? "" : displayName.trim();
        if (normalizedDisplayName.isEmpty() || normalizedDisplayName.length() > 120) {
            throw new IdentityException("VALIDATION_FAILED", "Display name must contain 1 to 120 characters");
        }
        user.setDisplayName(normalizedDisplayName);
        userRepository.flush();
        return toUserView(user);
    }

    @Transactional
    public void changePassword(UUID userId, long baseVersion, String currentPassword, String newPassword) {
        UserEntity user = userRepository.findForUpdateById(userId)
                .filter(found -> found.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(this::unauthenticated);
        requireVersion(user, baseVersion);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw invalidCredentials();
        }
        requirePasswordFitsEncoder(newPassword);
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new IdentityException("VALIDATION_FAILED", "New password must differ from the current password");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        Instant now = clock.instant();
        refreshSessionRepository.findAllByUserIdOrderByLastUsedAtDesc(userId)
                .forEach(session -> session.revoke(now));
    }

    @Transactional
    public void putAvatar(UUID userId, byte[] imageBytes) {
        UserEntity user = userRepository.findForUpdateById(userId)
                .filter(found -> found.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(this::unauthenticated);
        byte[] safePng = validateAndNormalizeAvatar(imageBytes);
        int updated = jdbcTemplate.update(
                "update user_avatars set content_type = 'image/png', image_bytes = ?, updated_at = CURRENT_TIMESTAMP where user_id = ?",
                safePng, user.getId());
        if (updated == 0) {
            jdbcTemplate.update(
                    "insert into user_avatars (user_id, content_type, image_bytes) values (?, 'image/png', ?)",
                    user.getId(), safePng);
        }
    }

    @Transactional(readOnly = true)
    public AvatarContent getAvatar(UUID userId) {
        activeUser(userId);
        return jdbcTemplate.query("select content_type, image_bytes from user_avatars where user_id = ?",
                resultSet -> resultSet.next()
                        ? new AvatarContent(resultSet.getString("content_type"), resultSet.getBytes("image_bytes"))
                        : null,
                userId);
    }

    @Transactional
    public void resetAvatar(UUID userId) {
        activeUser(userId);
        jdbcTemplate.update("delete from user_avatars where user_id = ?", userId);
    }

    @Transactional
    public AuthDtos.AccountDeletionResponse requestAccountDeletion(UUID userId, String password) {
        UserEntity user = userRepository.findForUpdateById(userId)
                .orElseThrow(this::unauthenticated);
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw invalidCredentials();
        }
        var existing = jdbcTemplate.query(
                "select id, status, requested_at, completed_at from account_deletion_jobs where user_id = ?",
                resultSet -> resultSet.next()
                        ? new AuthDtos.AccountDeletionResponse(
                                resultSet.getObject("id", UUID.class), resultSet.getString("status"),
                                resultSet.getTimestamp("requested_at").toInstant())
                        : null,
                userId);
        if (existing != null) {
            return existing;
        }
        UUID jobId = UUID.randomUUID();
        Instant now = clock.instant();
        Instant notBefore = now.plusSeconds(uploadIntentTtlSeconds + 60);
        user.disable();
        refreshSessionRepository.findAllByUserIdOrderByLastUsedAtDesc(userId)
                .forEach(session -> session.revoke(now));
        jdbcTemplate.update(
                "insert into account_deletion_jobs (id, user_id, status, requested_at, not_before) "
                        + "values (?, ?, 'PENDING', ?, ?)",
                jobId, userId,
                OffsetDateTime.ofInstant(now, ZoneOffset.UTC),
                OffsetDateTime.ofInstant(notBefore, ZoneOffset.UTC));
        Set<String> objectKeys = new HashSet<>(jdbcTemplate.query(
                "select object_key from assets where user_id = ?",
                (resultSet, rowNum) -> resultSet.getString("object_key"), userId));
        objectKeys.addAll(jdbcTemplate.query(
                "select object_key from parsed_documents where user_id = ?",
                (resultSet, rowNum) -> resultSet.getString("object_key"), userId));
        for (String objectKey : objectKeys) {
            jdbcTemplate.update("insert into account_deletion_objects (job_id, object_key) values (?, ?)",
                    jobId, objectKey);
        }
        return new AuthDtos.AccountDeletionResponse(jobId, "PENDING", now);
    }

    @Transactional(readOnly = true)
    public List<SessionView> listSessions(UUID userId, UUID currentDeviceId) {
        Instant now = clock.instant();
        Set<UUID> listedDevices = new HashSet<>();
        return refreshSessionRepository.findAllByUserIdOrderByLastUsedAtDesc(userId).stream()
                .filter(session -> !session.isRotatedOrRevoked() && !session.isExpired(now))
                .sorted(Comparator
                        .comparing((RefreshSessionEntity session) -> !session.getServerDeviceId().equals(currentDeviceId))
                        .thenComparing(RefreshSessionEntity::getLastUsedAt, Comparator.reverseOrder()))
                .filter(session -> listedDevices.add(session.getServerDeviceId()))
                .map(session -> {
                    DeviceEntity device = deviceRepository.findByIdAndUserId(session.getServerDeviceId(), userId)
                            .orElseThrow(this::unauthenticated);
                    return new SessionView(
                            session.getId(),
                            device.getId(),
                            device.getName(),
                            device.getPlatform(),
                            session.getCreatedAt(),
                            session.getLastUsedAt(),
                            session.getExpiresAt(),
                            session.getRevokedAt(),
                            device.getId().equals(currentDeviceId));
                })
                .toList();
    }

    @Transactional
    public void revokeSession(UUID userId, UUID sessionId) {
        userRepository.findForUpdateById(userId).orElseThrow(this::resourceNotFound);
        RefreshSessionEntity session = refreshSessionRepository.findByIdAndUserId(sessionId, userId)
                .orElseThrow(this::resourceNotFound);
        refreshSessionRepository.revokeActiveDeviceSessions(userId, session.getServerDeviceId(), clock.instant());
    }

    @Transactional
    public void revokeOtherSessions(UUID userId, UUID currentDeviceId) {
        userRepository.findForUpdateById(userId).orElseThrow(this::resourceNotFound);
        Instant now = clock.instant();
        refreshSessionRepository.findAllByUserIdOrderByLastUsedAtDesc(userId).stream()
                .filter(session -> !session.getServerDeviceId().equals(currentDeviceId))
                .filter(session -> !session.isRotatedOrRevoked() && !session.isExpired(now))
                .forEach(session -> session.revoke(now));
    }

    @Transactional(readOnly = true)
    public void requireActiveDevice(UUID userId, UUID serverDeviceId) {
        deviceRepository.findByIdAndUserId(serverDeviceId, userId)
                .filter(device -> device.getRevokedAt() == null)
                .orElseThrow(() -> new IdentityException("FORBIDDEN", "Device is not active for this user"));
    }

    private AuthResult issueForUser(UserEntity user, DeviceCommand deviceCommand) {
        DeviceEntity device = deviceRepository.findByUserIdAndClientDeviceKey(user.getId(), deviceCommand.clientDeviceKey())
                .map(existing -> {
                    existing.markActive(clock.instant());
                    return existing;
                })
                .orElseGet(() -> deviceRepository.save(new DeviceEntity(
                        UUID.randomUUID(),
                        user.getId(),
                        deviceCommand.clientDeviceKey(),
                        deviceCommand.name(),
                        deviceCommand.platform())));
        Instant now = clock.instant();
        refreshSessionRepository.findAllByUserIdOrderByLastUsedAtDesc(user.getId()).stream()
                .filter(session -> session.getServerDeviceId().equals(device.getId()))
                .filter(session -> !session.isRotatedOrRevoked())
                .forEach(session -> session.revoke(now));
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
                tokenService.issueTokenPair(user.getId(), session.getId(), device.getId(), user.getCredentialGeneration(), now, refreshToken),
                session.getId(),
                device.getId());
    }

    private UserView toUserView(UserEntity user) {
        Boolean hasAvatar = jdbcTemplate.queryForObject(
                "select exists (select 1 from user_avatars where user_id = ?)",
                Boolean.class,
                user.getId());
        return new UserView(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getVersion(), Boolean.TRUE.equals(hasAvatar));
    }

    private void requireVersion(UserEntity user, long baseVersion) {
        if (user.getVersion() != baseVersion) {
            throw new IdentityException("RESOURCE_VERSION_CONFLICT", "User profile changed since it was read");
        }
    }

    private void requirePasswordFitsEncoder(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IdentityException("VALIDATION_FAILED", "Password must not exceed 72 UTF-8 bytes");
        }
    }

    private UserEntity activeUser(UUID userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(this::unauthenticated);
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw unauthenticated();
        }
        return user;
    }

    private byte[] validateAndNormalizeAvatar(byte[] imageBytes) {
        if (imageBytes == null || imageBytes.length == 0 || imageBytes.length > 5 * 1024 * 1024) {
            throw new IdentityException("UPLOAD_VALIDATION_FAILED", "Avatar must be an image no larger than 5 MiB");
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(imageBytes))) {
            if (input == null) {
                throw invalidAvatar();
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw invalidAvatar();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName();
                if (!"png".equalsIgnoreCase(format) && !"jpeg".equalsIgnoreCase(format) && !"jpg".equalsIgnoreCase(format)) {
                    throw invalidAvatar();
                }
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 4096 || height > 4096 || (long) width * height > 16_000_000L) {
                    throw invalidAvatar();
                }
                BufferedImage image = reader.read(0);
                if (image == null) {
                    throw invalidAvatar();
                }
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                if (!ImageIO.write(image, "png", output) || output.size() > 5 * 1024 * 1024) {
                    throw invalidAvatar();
                }
                return output.toByteArray();
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw invalidAvatar();
        }
    }

    private IdentityException invalidAvatar() {
        return new IdentityException("UPLOAD_VALIDATION_FAILED", "Avatar must be a valid PNG or JPEG image");
    }

    private void queueEmailCode(String email, AuthEmailCodes.Purpose purpose) {
        emailDelivery.requireConfigured();
        try {
            authEmailExecutor.execute(() -> issueAndDeliverEmailCode(email, purpose));
        } catch (RejectedExecutionException exception) {
            throw new IdentityException("SERVICE_UNAVAILABLE", "Account email delivery is unavailable");
        }
    }

    private void issueAndDeliverEmailCode(String email, AuthEmailCodes.Purpose purpose) {
        try {
            var existing = userRepository.findByEmail(email);
            String addressKey = email;
            if (purpose == AuthEmailCodes.Purpose.REGISTRATION) {
                if (existing.isPresent()) {
                    return;
                }
            } else {
                var active = existing.filter(user -> user.getStatus() == UserStatus.ACTIVE);
                if (active.isEmpty()) {
                    return;
                }
                addressKey = email + ":" + active.get().getId();
            }
            String code = emailCodes.issue(addressKey, purpose);
            if (code == null) {
                return;
            }
            String action = purpose == AuthEmailCodes.Purpose.REGISTRATION
                    ? "verify your email address"
                    : "reset your password";
            emailDelivery.send(email, "Your Auralis verification code",
                    "Use this code to " + action + ": " + code + "\n\nThis code expires in 10 minutes.");
        } catch (RuntimeException exception) {
            LOGGER.warn("Account email delivery failed for {}", purpose);
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
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

    private IdentityException unauthenticated() {
        return new IdentityException(INVALID_CREDENTIALS_CODE, INVALID_CREDENTIALS_MESSAGE);
    }

    private IdentityException resourceNotFound() {
        return new IdentityException("RESOURCE_NOT_FOUND", "Session was not found");
    }

    public record AvatarContent(String contentType, byte[] bytes) {
        public AvatarContent {
            bytes = bytes.clone();
        }
        @Override public byte[] bytes() { return bytes.clone(); }
    }
}
