package com.auralis.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

    @BeforeEach
    void cleanIdentityData() {
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registersLogsInAndReturnsTheCurrentUser() throws Exception {
        JsonNode registered = register("alice@example.com", "browser-1", "Alice's browser");
        assertThat(registered.path("user").path("username").asText()).isEqualTo("alice@example.com");
        assertThat(registered.path("tokens").path("accessToken").asText()).isNotBlank();

        MvcResult login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("alice@example.com", "correct horse battery staple", "browser-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.username").value("alice@example.com"))
                .andReturn();
        String accessToken = json(login).path("tokens").path("accessToken").asText();

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice@example.com"))
                .andExpect(jsonPath("$.displayName").value("Alice"));
    }

    @Test
    void duplicateAndInvalidCredentialsUseStableProblemDetails() throws Exception {
        register("alice@example.com", "browser-1", "Alice's browser");

        mockMvc.perform(post("/api/auth/register")
                        .header("X-Trace-Id", "duplicate-check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson("alice@example.com", "another password", "browser-2", "Alice")))
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
                        .content(loginJson("alice@example.com", "wrong", "browser-2")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andReturn();

        assertThat(json(unknown).path("detail").asText()).isEqualTo(json(wrong).path("detail").asText());
    }

    @Test
    void refreshReplayAndLogoutInvalidateRefreshSessions() throws Exception {
        JsonNode registered = register("alice@example.com", "browser-1", "Alice's browser");
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

        JsonNode loggedIn = login("alice@example.com", "browser-1");
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
        JsonNode alice = register("alice@example.com", "browser-1", "Alice's browser");
        JsonNode bob = register("bob@example.com", "browser-2", "Bob's browser");

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
    void protectsPrivateRoutesAndDoesNotAcceptRefreshTokensAsAccessTokens() throws Exception {
        JsonNode registered = register("alice@example.com", "browser-1", "Alice's browser");
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
                .andExpect(jsonPath("$.fieldErrors[?(@.field == 'deviceId')]").exists());
    }

    private JsonNode register(String username, String deviceId, String deviceName) throws Exception {
        return json(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(username, "correct horse battery staple", deviceId, "Alice")))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION, org.hamcrest.Matchers.startsWith("/api/auth/sessions/")))
                .andReturn());
    }

    private JsonNode login(String username, String deviceId) throws Exception {
        return json(mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(username, "correct horse battery staple", deviceId)))
                .andExpect(status().isOk())
                .andReturn());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String registerJson(String username, String password, String deviceId, String displayName) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password
                + "\",\"displayName\":\"" + displayName + "\",\"deviceId\":\"" + deviceId
                + "\",\"deviceName\":\"Alice's browser\",\"platform\":\"WEB\"}";
    }

    private String loginJson(String username, String password, String deviceId) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password
                + "\",\"deviceId\":\"" + deviceId
                + "\",\"deviceName\":\"Alice's browser\",\"platform\":\"WEB\"}";
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
