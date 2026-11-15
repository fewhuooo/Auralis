package com.auralis.app;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.identity.AccountDeletionCleanupService;
import com.auralis.app.identity.AuthDtos;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityException;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetUploadIntentCommand;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.ParsedDocumentUploadCommand;
import com.auralis.app.source.internal.storage.InMemoryAssetStorage;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class AuthControllerTests {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountDeletionCleanupService accountDeletionCleanupService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TestAccountDeletionObjectStorageAdapter accountDeletionObjectStorage;

    @Autowired
    private InMemoryAssetStorage inMemoryAssetStorage;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private AssetService assetService;

    @Autowired
    private ParsedDocumentService parsedDocumentService;

    @Autowired
    private PlatformTransactionManager transactionManager;

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

    @BeforeEach
    void cleanIdentityData() {
        jdbcTemplate.update("delete from account_deletion_jobs");
        relationRepository.deleteAll();
        knowledgeBlockRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAllInBatch();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registersLogsInAndReturnsTheCurrentUser() throws Exception {
        String email = AuthTestAccounts.newEmail();
        JsonNode registered = registerWithEmail("alice", "browser-1", email);
        assertThat(registered.path("user").path("username").asText()).isEqualTo("alice");
        assertThat(registered.path("tokens").path("accessToken").asText()).isNotBlank();

        MvcResult login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(email.toUpperCase(Locale.ROOT), "correct horse battery staple", "browser-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.username").value("alice"))
                .andReturn();
        String accessToken = json(login).path("tokens").path("accessToken").asText();

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(jsonPath("$.displayName").value("alice"));
    }

    @Test
    void registrationRequiresVerificationAndLocksCodeAfterFiveWrongAttempts() throws Exception {
        String email = AuthTestAccounts.newEmail();
        String verification = AuthTestAccounts.registrationFields(mockMvc, email);
        String valid = registerJson("alice", "correct horse battery staple", "browser-1", verification);
        String wrong = valid.replaceFirst(
                "\"emailCode\":\"[0-9]", "\"emailCode\":\"" + (verification.contains("\"emailCode\":\"0") ? "1" : "0"));
        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(wrong))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[?(@.field == 'emailCode')]").exists());
        }

        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(valid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'emailCode')]").exists());
        assertThat(userRepository.findByEmail(email)).isEmpty();
    }

    @Test
    void passwordResetUsesItsOwnSingleUseCodeAndRevokesEveryDevice() throws Exception {
        String email = AuthTestAccounts.newEmail();
        JsonNode original = registerWithEmail("alice", "browser-1", email);
        JsonNode another = login("alice", "browser-2");
        String newPassword = "replacement password";
        mockMvc.perform(post("/api/auth/password/reset/email-code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + AuthTestAccounts.newEmail() + "\"}"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        mockMvc.perform(post("/api/auth/password/reset/email-code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        String code = AuthTestAccounts.awaitCode(email);

        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson("a-different-user", "correct horse battery staple", "browser-3",
                                "\"email\":\"" + email + "\",\"emailCode\":\"" + code + "\",")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'emailCode')]").exists());

        String request = "{\"email\":\"" + email + "\",\"emailCode\":\"" + code
                + "\",\"newPassword\":\"" + newPassword + "\"}";
        mockMvc.perform(post("/api/auth/password/reset").contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/password/reset").contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'emailCode')]").exists());
        for (JsonNode preceding : List.of(original, another)) {
            var tokens = preceding.path("tokens");
            mockMvc.perform(get("/api/auth/me")
                            .header(HttpHeaders.AUTHORIZATION, bearer(tokens.path("accessToken").asText())))
                    .andExpect(status().isUnauthorized());
            mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"refreshToken\":\"" + tokens.path("refreshToken").asText() + "\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(email, "correct horse battery staple", "browser-1")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(email, newPassword, "browser-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(original.path("user").path("id").asText()));
    }

    @Test
    void logoutWithEarlierAccessRevokesOnlyItsRotatedFamily() throws Exception {
        JsonNode original = register("alice", "browser-1", "Alice's browser");
        JsonNode anotherDevice = login("alice", "browser-2");
        JsonNode rotated = json(mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + original.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk()).andReturn());

        mockMvc.perform(post("/api/auth/logout")
                        .header(HttpHeaders.AUTHORIZATION, bearer(original.path("tokens").path("accessToken").asText())))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + rotated.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + anotherDevice.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void duplicateAndInvalidCredentialsUseStableProblemDetails() throws Exception {
        register("alice", "browser-1", "Alice's browser");

        mockMvc.perform(post("/api/auth/register")
                        .header("X-Trace-Id", "duplicate-check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson("alice", "another password", "browser-2", invalidVerificationFields())))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("MUTATION_REJECTED"))
                .andExpect(jsonPath("$.traceId").value("duplicate-check"));

        MvcResult unknown = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("missing@example.com", "wrong", "browser-2")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andReturn();
        MvcResult wrong = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("alice", "wrong", "browser-2")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andReturn();

        assertThat(json(unknown).path("detail").asText()).isEqualTo(json(wrong).path("detail").asText());
    }

    @Test
    void refreshReplayAndLogoutInvalidateRefreshSessions() throws Exception {
        JsonNode registered = register("alice", "browser-1", "Alice's browser");
        String refreshToken = registered.path("tokens").path("refreshToken").asText();

        MvcResult rotated = mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refreshToken + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String rotatedRefreshToken = json(rotated).path("tokens").path("refreshToken").asText();

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refreshToken + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + rotatedRefreshToken + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        JsonNode loggedIn = login("alice", "browser-1");
        mockMvc.perform(post("/api/auth/logout")
                        .header(HttpHeaders.AUTHORIZATION,
                                bearer(loggedIn.path("tokens").path("accessToken").asText())))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + loggedIn.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void listsOnlyOwnedSessionsAndRejectsCrossUserRevocation() throws Exception {
        JsonNode alice = register("alice", "browser-1", "Alice's browser");
        JsonNode bob = register("bob", "browser-2", "Bob's browser");

        MvcResult sessions = mockMvc.perform(get("/api/auth/sessions")
                        .header(HttpHeaders.AUTHORIZATION,
                                bearer(alice.path("tokens").path("accessToken").asText())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andReturn();
        String aliceSessionId = json(sessions).path("items").get(0).path("id").asText();

        mockMvc.perform(delete("/api/auth/sessions/{id}", aliceSessionId)
                        .header(HttpHeaders.AUTHORIZATION,
                                bearer(bob.path("tokens").path("accessToken").asText())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + alice.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void keepsOneCurrentSessionForRepeatedLoginsOnTheSameDevice() throws Exception {
        JsonNode registered = register("alice", "browser-1", "Alice's browser");
        JsonNode current = login("alice", "browser-1");

        JsonNode listed = json(mockMvc.perform(get("/api/auth/sessions")
                        .header(HttpHeaders.AUTHORIZATION,
                                bearer(current.path("tokens").path("accessToken").asText())))
                .andExpect(status().isOk())
                .andReturn());

        int currentDeviceEntries = 0;
        JsonNode currentDeviceEntry = null;
        for (JsonNode session : listed.path("items")) {
            if (session.path("serverDeviceId").asText().equals(current.path("serverDeviceId").asText())) {
                currentDeviceEntries++;
                if (session.path("current").asBoolean()) {
                    currentDeviceEntry = session;
                }
            }
        }
        assertThat(currentDeviceEntries).isEqualTo(1);
        assertThat(currentDeviceEntry).isNotNull();
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + registered.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deviceRevocationFollowsRotationsAndKeepsTheCallingDeviceActive() throws Exception {
        JsonNode caller = register("alice", "browser-1", "Alice's browser");
        JsonNode remote = login("alice", "browser-2");
        String callerAccess = bearer(caller.path("tokens").path("accessToken").asText());
        JsonNode listed = json(mockMvc.perform(get("/api/auth/sessions")
                        .header(HttpHeaders.AUTHORIZATION, callerAccess))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andReturn());
        String listedRemoteId = listed.path("items").get(1).path("id").asText();
        assertThat(listedRemoteId).isEqualTo(remote.path("sessionId").asText());

        JsonNode callerRotated = json(mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + caller.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk()).andReturn());
        JsonNode remoteRotated = json(mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + remote.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk()).andReturn());
        assertThat(remoteRotated.path("sessionId").asText()).isNotEqualTo(listedRemoteId);
        mockMvc.perform(delete("/api/auth/sessions/{id}", listedRemoteId).header(HttpHeaders.AUTHORIZATION, callerAccess))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + remoteRotated.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/sessions").header(HttpHeaders.AUTHORIZATION, callerAccess))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(callerRotated.path("sessionId").asText()))
                .andExpect(jsonPath("$.items[0].current").value(true));

        JsonNode remoteNewLogin = login("alice", "browser-2");
        mockMvc.perform(delete("/api/auth/sessions/others").header(HttpHeaders.AUTHORIZATION, callerAccess))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + remoteNewLogin.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + callerRotated.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void deviceRevocationWaitsForInFlightRotationAndRevokesTheCommittedReplacement() throws Exception {
        JsonNode registered = register("alice", "browser-1", "Alice's browser");
        UUID userId = UUID.fromString(registered.path("user").path("id").asText());
        UUID listedSessionId = UUID.fromString(registered.path("sessionId").asText());
        String originalRefreshToken = registered.path("tokens").path("refreshToken").asText();
        CountDownLatch started = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            AtomicReference<Future<?>> revocation = new AtomicReference<>();
            AuthResult rotated = new TransactionTemplate(transactionManager).execute(status -> {
                AuthResult replacement = identityService.refresh(originalRefreshToken);
                Future<?> pending = executor.submit(() -> {
                    started.countDown();
                    identityService.revokeSession(userId, listedSessionId);
                });
                revocation.set(pending);
                try {
                    assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> pending.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
                return replacement;
            });
            revocation.get().get(5, TimeUnit.SECONDS);
            assertThatThrownBy(() -> identityService.refresh(rotated.tokens().refreshToken()))
                    .isInstanceOf(IdentityException.class);
        }
    }

    @Test
    void protectsPrivateRoutesAndDoesNotAcceptRefreshTokensAsAccessTokens() throws Exception {
        JsonNode registered = register("alice", "browser-1", "Alice's browser");
        String refreshToken = registered.path("tokens").path("refreshToken").asText();

        mockMvc.perform(get("/api/auth/me").header("X-Trace-Id", "auth-required"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.traceId").value("auth-required"))
                .andExpect(header().string("X-Trace-Id", "auth-required"));

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(refreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void returnsFieldErrorsForInvalidRegistration() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson("", "short", "", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'username')]").exists())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'password')]").exists())
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'clientDeviceKey')]").exists());
    }

    @Test
    void updatesOnlyAuthenticatedUsersDisplayName() throws Exception {
        JsonNode alice = register("alice", "profile-alice", "Alice's browser");
        JsonNode bob = register("bob", "profile-bob", "Bob's browser");
        String aliceToken = alice.path("tokens").path("accessToken").asText();
        String bobToken = bob.path("tokens").path("accessToken").asText();

        mockMvc.perform(put("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(bobToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"displayName\":\"Bob\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(aliceToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"displayName\":\"New Alice\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("New Alice"));

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(bobToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Bob"));

        mockMvc.perform(put("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(bobToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"displayName\":\"Stale write\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESOURCE_VERSION_CONFLICT"));
    }

    @Test
    void changingPasswordPreservesCurrentDeviceRefreshAndRevokesOtherDevices() throws Exception {
        JsonNode current = register("alice", "password-alice", "Alice's browser");
        JsonNode other = login("alice", "password-alice-other");
        String currentAccess = current.path("tokens").path("accessToken").asText();
        String otherAccess = other.path("tokens").path("accessToken").asText();

        mockMvc.perform(put("/api/auth/password")
                        .header(HttpHeaders.AUTHORIZATION, bearer(currentAccess))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"currentPassword\":\"wrong password\",\"newPassword\":\"a longer new password\"}"))
                .andExpect(status().isUnauthorized());
        for (String accessToken : List.of(currentAccess, otherAccess)) {
            mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.version").value(0));
        }
        JsonNode rotatedCurrent = refresh(current);
        JsonNode rotatedOther = refresh(other);

        mockMvc.perform(put("/api/auth/password")
                        .header(HttpHeaders.AUTHORIZATION, bearer(rotatedCurrent.path("tokens").path("accessToken").asText()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"currentPassword\":\"correct horse battery staple\",\"newPassword\":\"a longer new password\"}"))
                .andExpect(status().isNoContent());
        for (JsonNode rotated : List.of(rotatedCurrent, rotatedOther)) {
            mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION,
                            bearer(rotated.path("tokens").path("accessToken").asText())))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + rotatedOther.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
        JsonNode renewedCurrent = refresh(rotatedCurrent);
        assertThat(renewedCurrent.path("serverDeviceId")).isEqualTo(current.path("serverDeviceId"));
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION,
                        bearer(renewedCurrent.path("tokens").path("accessToken").asText())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("alice", "correct horse battery staple", "password-alice-next")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("alice", "a longer new password", "password-alice-next")))
                .andExpect(status().isOk());
    }

    @Test
    void registerAndPasswordChangeEnforceTheEncoderByteLimit() throws Exception {
        String username = "password-limit";
        String maxLength = "界".repeat(24);
        for (String tooLong : new String[] {"a".repeat(73), maxLength + "界"}) {
            mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                            .content(registerJson(username, tooLong, "browser-1", invalidVerificationFields())))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        JsonNode registered = json(mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(username, maxLength, "browser-1",
                                AuthTestAccounts.registrationFields(mockMvc, AuthTestAccounts.newEmail()))))
                .andExpect(status().isCreated()).andReturn());
        String accessToken = bearer(registered.path("tokens").path("accessToken").asText());
        mockMvc.perform(put("/api/auth/password").header(HttpHeaders.AUTHORIZATION, accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"currentPassword\":\"" + maxLength
                                + "\",\"newPassword\":\"" + maxLength + "a\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.detail").value("Password must not exceed 72 UTF-8 bytes"));
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(username, maxLength, "browser-2")))
                .andExpect(status().isOk());
        String newPassword = "b".repeat(72);
        mockMvc.perform(put("/api/auth/password").header(HttpHeaders.AUTHORIZATION, accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"currentPassword\":\"" + maxLength
                                + "\",\"newPassword\":\"" + newPassword + "\"}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(username, newPassword, "browser-3")))
                .andExpect(status().isOk());
    }

    @Test
    void avatarUploadValidatesImageAndSupportsPrivateReadAndReset() throws Exception {
        JsonNode alice = register("alice", "avatar-alice", "Alice's browser");
        JsonNode bob = register("bob", "avatar-bob", "Bob's browser");
        String token = alice.path("tokens").path("accessToken").asText();
        String bobToken = bob.path("tokens").path("accessToken").asText();
        assertThat(alice.path("user").path("hasAvatar").asBoolean()).isFalse();
        assertThat(bob.path("user").path("hasAvatar").asBoolean()).isFalse();
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasAvatar").value(false));
        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pV8AAAAASUVORK5CYII=");

        mockMvc.perform(multipart("/api/auth/me/avatar")
                        .file(new MockMultipartFile("file", "avatar.png", "image/png", png))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasAvatar").value(true));
        mockMvc.perform(get("/api/auth/me/avatar").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));
        JsonNode loggedIn = login("alice", "avatar-alice");
        assertThat(loggedIn.path("user").path("hasAvatar").asBoolean()).isTrue();
        MvcResult refreshed = mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + loggedIn.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.hasAvatar").value(true))
                .andReturn();
        String refreshedToken = json(refreshed).path("tokens").path("accessToken").asText();
        mockMvc.perform(put("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(refreshedToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"displayName\":\"Alice Updated\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasAvatar").value(true));
        mockMvc.perform(get("/api/auth/me/avatar").header(HttpHeaders.AUTHORIZATION, bearer(bobToken)))
                .andExpect(status().isNotFound());
        mockMvc.perform(multipart("/api/auth/me/avatar")
                        .file(new MockMultipartFile("file", "avatar.png", "image/png", "not an image".getBytes()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/auth/me/avatar").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasAvatar").value(false));
        mockMvc.perform(get("/api/auth/me/avatar").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletesAssetlessAccountAndRevokesItsSessions() throws Exception {
        JsonNode alice = register("alice", "delete-alice", "Alice's browser");
        String token = alice.path("tokens").path("accessToken").asText();
        UUID userId = UUID.fromString(alice.path("user").path("id").asText());
        UUID subjectId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        jdbcTemplate.update("insert into subjects (id, user_id, name, sort_key) values (?, ?, 'Delete me', '')",
                subjectId, userId);
        jdbcTemplate.update("insert into tasks (id, user_id, subject_id, title, status, sort_key) "
                + "values (?, ?, ?, 'Delete me', 'TODO', '')", taskId, userId, subjectId);
        UUID focusSessionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID ingestionRevision = UUID.randomUUID();
        UUID overviewResultId = UUID.randomUUID();
        UUID overviewWriteReceiptId = UUID.randomUUID();
        jdbcTemplate.update("insert into focus_sessions "
                        + "(id, user_id, client_session_id, task_id, started_at, ended_at, duration_seconds, completed) "
                        + "values (?, ?, ?, ?, ?, ?, 120, false)",
                focusSessionId, userId, UUID.randomUUID(), taskId,
                Instant.parse("2026-09-01T10:00:00Z"), Instant.parse("2026-09-01T10:02:00Z"));
        jdbcTemplate.update("insert into overview_results "
                        + "(id, user_id, scope_type, scope_id, subject_id, source_id, ingestion_revision, "
                        + "version, outline_version, summary_version, title, schema_version, outline, summary, "
                        + "outline_input_origin, summary_input_origin) "
                        + "values (?, ?, 'SOURCE', ?, ?, ?, ?, 1, 1, 1, 'Overview', 1, '[]', '{}', 'SOURCE_REVISION', 'SOURCE_REVISION')",
                overviewResultId, userId, sourceId, subjectId, sourceId, ingestionRevision);
        jdbcTemplate.update("insert into overview_write_receipts "
                        + "(id, user_id, client_write_id, scope_type, scope_id, base_version, payload_hash, response_snapshot) "
                        + "values (?, ?, ?, 'SOURCE', ?, 0, ?, '{}')",
                overviewWriteReceiptId, userId, UUID.randomUUID(), sourceId, "a".repeat(64));

        mockMvc.perform(delete("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"incorrect password\"}"))
                .andExpect(status().isUnauthorized());
        assertThat(userRepository.findById(userId)).isPresent();

        MvcResult requested = mockMvc.perform(delete("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"correct horse battery staple\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn();

        String jobId = json(requested).path("id").asText();
        assertThat(userRepository.findByNormalizedUsername("alice")).isPresent();
        jdbcTemplate.update("update account_deletion_jobs set not_before = ? where id = ?",
                Instant.EPOCH, UUID.fromString(jobId));
        assertThat(accountDeletionCleanupService.processPending()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("select count(*) from tasks where id = ?", Integer.class, taskId)).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from subjects where id = ?", Integer.class, subjectId)).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from focus_sessions where id = ?", Integer.class,
                focusSessionId)).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from overview_results where id = ?", Integer.class,
                overviewResultId)).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from overview_write_receipts where id = ?", Integer.class,
                overviewWriteReceiptId)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select status from account_deletion_jobs where id = ?", String.class, UUID.fromString(jobId)))
                .isEqualTo("COMPLETED");

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + alice.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isUnauthorized());
        assertThat(userRepository.findByNormalizedUsername("alice")).isEmpty();
    }

    @Test
    void accountDeletionWaitsForUploadUrlExpiryAndClaimsCleanupJobOnce() throws Exception {
        JsonNode alice = register("alice", "delete-race", "Alice's browser");
        String token = alice.path("tokens").path("accessToken").asText();
        UUID userId = UUID.fromString(alice.path("user").path("id").asText());
        String objectKey = "users/" + userId + "/assets/race.bin";
        UUID assetId = UUID.randomUUID();
        jdbcTemplate.update("insert into assets (id, user_id, object_key, original_name, size_bytes, mime_type, upload_status) "
                + "values (?, ?, ?, 'race.bin', 4, 'application/octet-stream', 'READY')",
                assetId, userId, objectKey);
        inMemoryAssetStorage.putObject(objectKey, new byte[] { 1, 2, 3, 4 });

        MvcResult requested = mockMvc.perform(delete("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"correct horse battery staple\"}"))
                .andExpect(status().isAccepted())
                .andReturn();
        UUID jobId = UUID.fromString(json(requested).path("id").asText());
        assertThat(accountDeletionCleanupService.processPending()).isZero();
        assertThat(userRepository.findById(userId)).isPresent();

        jdbcTemplate.update("update account_deletion_jobs set not_before = ? where id = ?", Instant.EPOCH, jobId);
        accountDeletionObjectStorage.failNextDelete();
        assertThat(accountDeletionCleanupService.processPending()).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select status from account_deletion_jobs where id = ?", String.class, jobId)).isEqualTo("FAILED");
        assertThat(userRepository.findById(userId)).isPresent();
        accountDeletionObjectStorage.blockNextDelete();
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            Future<Integer> first = executor.submit(accountDeletionCleanupService::processPending);
            assertThat(accountDeletionObjectStorage.awaitDeleteStarted()).isTrue();
            assertThat(accountDeletionCleanupService.processPending()).isZero();
            accountDeletionObjectStorage.releaseDelete();
            assertThat(first.get()).isEqualTo(1);
        }

        assertThat(accountDeletionObjectStorage.deleteCount()).isEqualTo(2);
        assertThat(userRepository.findById(userId)).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "select status from account_deletion_jobs where id = ?", String.class, jobId)).isEqualTo("COMPLETED");
    }

    @Test
    void completedAccountDeletionReconcilesLateWritesToPreviouslyAuthorizedObjectKeys() throws Exception {
        JsonNode alice = register("alice", "delete-late-write", "Alice's browser");
        UUID userId = UUID.fromString(alice.path("user").path("id").asText());
        AssetUploadIntentCommand command = new AssetUploadIntentCommand(
                0, UUID.randomUUID(), "late-write.bin", 4, "application/octet-stream", null);
        inMemoryAssetStorage.blockNextUploadIntent();
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> upload = executor.submit(() -> assetService.createUploadIntent(userId, command));
            assertThat(inMemoryAssetStorage.awaitUploadIntentStarted()).isTrue();
            Future<?> deletion = executor.submit(() ->
                    identityService.requestAccountDeletion(userId, "correct horse battery staple"));
            assertThatThrownBy(() -> deletion.get(300, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            inMemoryAssetStorage.releaseUploadIntent();
            upload.get(2, TimeUnit.SECONDS);
            AuthDtos.AccountDeletionResponse response =
                    (AuthDtos.AccountDeletionResponse) deletion.get(2, TimeUnit.SECONDS);
            UUID jobId = response.id();
            String objectKey = jdbcTemplate.queryForObject(
                    "select object_key from assets where user_id = ?", String.class, userId);
            assertThat(jdbcTemplate.queryForObject(
                    "select count(*) from account_deletion_objects where job_id = ? and object_key = ?",
                    Integer.class, jobId, objectKey)).isEqualTo(1);
            assertThat(userRepository.findById(userId)).isPresent();

            jdbcTemplate.update("update account_deletion_jobs set not_before = ? where id = ?", Instant.EPOCH, jobId);
            assertThat(accountDeletionCleanupService.processPending()).isEqualTo(1);
            assertThat(userRepository.findById(userId)).isEmpty();

            // A PUT authorized before deletion can finish after the first delete.
            inMemoryAssetStorage.putObject(objectKey, new byte[] { 1, 2, 3, 4 });
            jdbcTemplate.update("update account_deletion_jobs set next_object_scan_at = ? where id = ?", Instant.EPOCH, jobId);
            assertThat(accountDeletionCleanupService.processPending()).isZero();
            assertThatThrownBy(() -> inMemoryAssetStorage.openObject(objectKey))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThat(jdbcTemplate.queryForObject(
                    "select status from account_deletion_jobs where id = ?", String.class, jobId)).isEqualTo("COMPLETED");
        } finally {
            inMemoryAssetStorage.releaseUploadIntent();
        }
    }

    @Test
    void loginWaitsForUserLockBeforeCheckingPasswordAndIssuingSession() throws Exception {
        JsonNode alice = register("alice", "login-lock", "Alice's browser");
        UUID userId = UUID.fromString(alice.path("user").path("id").asText());
        CountDownLatch started = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            AtomicReference<Future<AuthResult>> loginRef = new AtomicReference<>();
            TransactionTemplate transaction = new TransactionTemplate(transactionManager);
            transaction.execute(status -> {
                assertThat(userRepository.findForUpdateById(userId)).isPresent();
                Future<AuthResult> login = executor.submit(() -> {
                    started.countDown();
                    return identityService.login("alice", "correct horse battery staple",
                            new DeviceCommand("stale-login", "Stale login", DevicePlatform.WEB));
                });
                loginRef.set(login);
                try {
                    assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> login.get(300, TimeUnit.MILLISECONDS))
                            .isInstanceOf(TimeoutException.class);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
                identityService.changePassword(userId, UUID.fromString(alice.path("serverDeviceId").asText()), 0,
                        "correct horse battery staple", "a different long password");
                return null;
            });
            Future<AuthResult> login = loginRef.get();
            assertThatThrownBy(login::get)
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(IdentityException.class);
            assertThat(refreshSessionRepository.findAllByUserIdOrderByLastUsedAtDesc(userId))
                    .singleElement().satisfies(session -> assertThat(session.getRevokedAt()).isNull());
        }
    }

    @Test
    void refreshWaitsForUserLockBeforeLockingOrRotatingSession() throws Exception {
        JsonNode alice = register("alice", "refresh-lock", "Alice's browser");
        UUID userId = UUID.fromString(alice.path("user").path("id").asText());
        String rawRefreshToken = alice.path("tokens").path("refreshToken").asText();
        CountDownLatch started = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            AtomicReference<Future<AuthResult>> refreshRef = new AtomicReference<>();
            TransactionTemplate transaction = new TransactionTemplate(transactionManager);
            transaction.execute(status -> {
                assertThat(userRepository.findForUpdateById(userId)).isPresent();
                Future<AuthResult> refresh = executor.submit(() -> {
                    started.countDown();
                    return identityService.refresh(rawRefreshToken);
                });
                refreshRef.set(refresh);
                try {
                    assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> refresh.get(300, TimeUnit.MILLISECONDS))
                            .isInstanceOf(TimeoutException.class);
                    Thread.sleep(100);
                    String tokenHash = jdbcTemplate.queryForObject(
                            "select token_hash from refresh_sessions where user_id = ? and replaced_by_session_id is null",
                            String.class, userId);
                    Future<Boolean> canLockSession = executor.submit(() ->
                            new TransactionTemplate(transactionManager).execute(inner ->
                                    refreshSessionRepository.findByTokenHashForUpdate(tokenHash).isPresent()));
                    assertThat(canLockSession.get(500, TimeUnit.MILLISECONDS)).isTrue();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                } catch (ExecutionException | TimeoutException exception) {
                    throw new IllegalStateException(exception);
                }
                return null;
            });
            Future<AuthResult> refresh = refreshRef.get();
            assertThat(refresh.get()).isNotNull();
        }
    }

    @Test
    void disabledAccountCannotCreateAnAssetUploadIntent() throws Exception {
        JsonNode alice = register("alice", "disabled-upload", "Alice's browser");
        UUID userId = UUID.fromString(alice.path("user").path("id").asText());
        identityService.requestAccountDeletion(userId, "correct horse battery staple");

        assertThatThrownBy(() -> assetService.createUploadIntent(userId,
                new AssetUploadIntentCommand(0, UUID.randomUUID(), "file.txt", 4,
                        "text/plain", null)))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> parsedDocumentService.createUploadIntent(userId, UUID.randomUUID(),
                new ParsedDocumentUploadCommand(UUID.randomUUID(), 1, "parser", "1", "1", null,
                        "a".repeat(64), "b".repeat(64), 4)))
                .isInstanceOf(RuntimeException.class);
        assertThat(jdbcTemplate.queryForObject("select count(*) from assets where user_id = ?", Integer.class, userId))
                .isZero();
    }

    private JsonNode register(String username, String clientDeviceKey, String deviceName) throws Exception {
        return registerWithEmail(username, clientDeviceKey, AuthTestAccounts.newEmail());
    }

    private JsonNode registerWithEmail(String username, String clientDeviceKey, String email) throws Exception {
        return json(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(username, "correct horse battery staple", clientDeviceKey,
                                AuthTestAccounts.registrationFields(mockMvc, email))))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION, org.hamcrest.Matchers.startsWith("/api/auth/sessions/")))
                .andReturn());
    }

    private JsonNode refresh(JsonNode auth) throws Exception {
        return json(mockMvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + auth.path("tokens").path("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk())
                .andReturn());
    }

    private JsonNode login(String username, String clientDeviceKey) throws Exception {
        return json(mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(username, "correct horse battery staple", clientDeviceKey)))
                .andExpect(status().isOk())
                .andReturn());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String invalidVerificationFields() {
        return "\"email\":\"" + AuthTestAccounts.newEmail() + "\",\"emailCode\":\"123456\",";
    }

    private String registerJson(String username, String password, String clientDeviceKey,
            String verificationFields) {
        return "{" + verificationFields + "\"username\":\"" + username + "\",\"password\":\"" + password
                + "\",\"clientDeviceKey\":\"" + clientDeviceKey
                + "\",\"deviceName\":\"Alice's browser\",\"platform\":\"WEB\"}";
    }

    private String loginJson(String username, String password, String clientDeviceKey) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password
                + "\",\"clientDeviceKey\":\"" + clientDeviceKey
                + "\",\"deviceName\":\"Alice's browser\",\"platform\":\"WEB\"}";
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
