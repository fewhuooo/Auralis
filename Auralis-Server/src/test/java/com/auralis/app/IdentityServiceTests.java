package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityException;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.identity.TokenPair;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@Import(IdentityServiceTests.TestClockConfiguration.class)
@TestPropertySource(properties = {
        "auralis.identity.jwt-secret=phase-one-test-secret-with-at-least-32-bytes",
        "auralis.identity.access-token-ttl-seconds=900",
        "auralis.identity.refresh-session-ttl-seconds=30"
})
class IdentityServiceTests {

    private static final Instant BASE_TIME = Instant.parse("2026-08-12T00:00:00Z");

    @Autowired
    private IdentityService identityService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private RelationRepository relationRepository;

    @Autowired
    private SourceRepository sourceRepository;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private JwtDecoder jwtDecoder;

    @Autowired
    private MutableClock mutableClock;

    @BeforeEach
    void cleanIdentityData() {
        relationRepository.deleteAll();
        knowledgeBlockRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
        mutableClock.setInstant(BASE_TIME);
    }

    @Test
    void registrationNormalizesUsernameAndStoresDelegatedPasswordHash() {
        AuthResult result = AuthTestAccounts.register(identityService, "  Alice ",
                "correct horse battery staple",
                new DeviceCommand("browser-1", "Browser", DevicePlatform.WEB));

        assertThat(result.user().username()).isEqualTo("Alice");
        assertThat(result.user().displayName()).isEqualTo("Alice");
        assertThat(result.user().displayName()).isEqualTo("Alice");
        assertThat(result.tokens().refreshToken()).isNotBlank();
        assertThat(userRepository.findByNormalizedUsername("alice"))
                .get()
                .extracting(user -> user.getPasswordHash())
                .asString()
                .startsWith("{bcrypt}")
                .doesNotContain("correct horse battery staple");
    }

    @Test
    void unknownAndWrongPasswordUseTheSameExternalError() {
        AuthTestAccounts.register(identityService, "alice",
                "correct horse battery staple",
                new DeviceCommand("browser-1", "Browser", DevicePlatform.WEB));

        IdentityException unknown = catchIdentityException(() -> identityService.login(
                "missing@example.com", "wrong", new DeviceCommand("browser-2", "Browser", DevicePlatform.WEB)));
        IdentityException wrong = catchIdentityException(() -> identityService.login(
                "alice", "wrong", new DeviceCommand("browser-2", "Browser", DevicePlatform.WEB)));

        assertThat(unknown.code()).isEqualTo("UNAUTHENTICATED");
        assertThat(wrong.code()).isEqualTo(unknown.code());
        assertThat(wrong.getMessage()).isEqualTo(unknown.getMessage());
    }

    @Test
    void refreshRotatesTokenAndReplayRevokesTheWholeFamily() {
        AuthResult registered = registerAlice();

        AuthResult rotated = identityService.refresh(registered.tokens().refreshToken());

        assertThat(rotated.tokens().refreshToken()).isNotEqualTo(registered.tokens().refreshToken());
        assertThatThrownBy(() -> identityService.refresh(registered.tokens().refreshToken()))
                .isInstanceOf(IdentityException.class)
                .extracting(error -> ((IdentityException) error).code())
                .isEqualTo("UNAUTHENTICATED");
        assertThat(refreshSessionRepository.findAll())
                .allMatch(session -> session.getRevokedAt() != null);
        assertThatThrownBy(() -> identityService.refresh(rotated.tokens().refreshToken()))
                .isInstanceOf(IdentityException.class)
                .extracting(error -> ((IdentityException) error).code())
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void expiredAndLoggedOutRefreshSessionsAreRejected() {
        AuthResult registered = registerAlice();
        mutableClock.advanceSeconds(31);

        assertThatThrownBy(() -> identityService.refresh(registered.tokens().refreshToken()))
                .isInstanceOf(IdentityException.class)
                .extracting(error -> ((IdentityException) error).code())
                .isEqualTo("UNAUTHENTICATED");

        mutableClock.setInstant(BASE_TIME);
        AuthResult second = registerBob();
        identityService.logout(second.user().id(), second.sessionId());
        assertThatThrownBy(() -> identityService.refresh(second.tokens().refreshToken()))
                .isInstanceOf(IdentityException.class)
                .extracting(error -> ((IdentityException) error).code())
                .isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void accessJwtContainsOnlyMinimalAuthenticationClaims() {
        AuthResult result = registerAlice();
        Jwt jwt = jwtDecoder.decode(result.tokens().accessToken());

        assertThat(jwt.getSubject()).isEqualTo(result.user().id().toString());
        assertThat(jwt.getClaimAsString("sid")).isEqualTo(result.sessionId().toString());
        assertThat(jwt.getClaimAsString("serverDeviceId")).isEqualTo(result.serverDeviceId().toString());
        assertThat(jwt.getClaimAsString("typ")).isEqualTo("access");
        assertThat(jwt.getClaims()).doesNotContainKeys("passwordHash", "refreshToken", "tokenHash");
    }

    private AuthResult registerAlice() {
        return AuthTestAccounts.register(identityService, "alice", "correct horse battery staple",
                new DeviceCommand("browser-1", "Browser", DevicePlatform.WEB));
    }

    private AuthResult registerBob() {
        return AuthTestAccounts.register(identityService, "bob", "correct horse battery staple",
                new DeviceCommand("browser-2", "Browser", DevicePlatform.WEB));
    }

    private IdentityException catchIdentityException(ThrowingOperation operation) {
        try {
            operation.run();
        } catch (IdentityException error) {
            return error;
        }
        throw new AssertionError("Expected IdentityException");
    }

    @FunctionalInterface
    private interface ThrowingOperation {
        void run();
    }

    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods = false)
    static class TestClockConfiguration {
        @org.springframework.context.annotation.Bean
        MutableClock clock() {
            return new MutableClock(BASE_TIME);
        }

        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        Clock clockAlias(MutableClock clock) {
            return clock;
        }
    }

    static class MutableClock extends Clock {
        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void setInstant(Instant instant) {
            this.instant = instant;
        }

        void advanceSeconds(long seconds) {
            instant = instant.plusSeconds(seconds);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
