package com.auralis.app;

import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SyncControllerJsonCompatibilityTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Test
    void acceptsAnObjectPayloadAtTheSyncHttpBoundary() throws Exception {
        AuthResult auth = identityService.register(
                "sync-json-" + UUID.randomUUID(),
                "sync-json-password",
                "Sync JSON",
                new DeviceCommand("sync-json-device-" + UUID.randomUUID(), "Sync JSON", DevicePlatform.WEB));
        UUID subjectId = UUID.randomUUID();

        mockMvc.perform(post("/api/sync/push")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"serverDeviceId":"%s","mutations":[{
                                  "clientMutationId":"sync-json-1","resourceType":"SUBJECT",
                                  "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
                                  "payload":{"name":"Sync JSON","sortKey":"001"}
                                }]}
                                """.formatted(auth.serverDeviceId(), subjectId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("APPLIED"));
    }
}
