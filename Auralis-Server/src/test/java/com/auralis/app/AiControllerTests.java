package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import org.springframework.http.HttpHeaders;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class AiControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Test
    void requiresAuthenticationForSettingsReadAndWrite() throws Exception {
        mockMvc.perform(get("/api/ai/settings"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(put("/api/ai/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"DEEPSEEK\",\"apiKey\":\"secret\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(get("/api/ai/settings/OPENAI_COMPATIBLE/models"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/ai/settings/OPENAI_COMPATIBLE/test-connection"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void exposesOnlyTheAuthenticatedUsersUsageSnapshot() throws Exception {
        var auth = AuthTestAccounts.register(identityService, "usage-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple",
                new DeviceCommand("usage-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));

        mockMvc.perform(get("/api/ai/usage")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hourly.limitTokens").isNumber())
                .andExpect(jsonPath("$.hourly.chargedTokens").isNumber())
                .andExpect(jsonPath("$.hourly.reservedTokens").isNumber())
                .andExpect(jsonPath("$.hourly.remainingTokens").isNumber())
                .andExpect(jsonPath("$.hourly.resetAt").isNotEmpty())
                .andExpect(jsonPath("$.daily.limitTokens").isNumber())
                .andExpect(jsonPath("$.daily.resetAt").isNotEmpty())
                .andExpect(jsonPath("$.global").doesNotExist())
                .andExpect(jsonPath("$.userId").doesNotExist());
    }

    @Test
    void requiresAuthenticationForUsageRead() throws Exception {
        mockMvc.perform(get("/api/ai/usage"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }
}
