package com.auralis.app;

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
@ActiveProfiles("test")
@AutoConfigureMockMvc
class AiOverviewControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Test
    void rejectsOverlongSourceOverviewInstructionsBeforeGeneration() throws Exception {
        var auth = identityService.register(
                "oc-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple", "overview-controller",
                new DeviceCommand("overview-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));

        mockMvc.perform(post("/api/ai/source-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sourceId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"mode\":\"ALL\",\"instruction\":\"" + "x".repeat(2001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("instruction"));
    }

    @Test
    void rejectsSubjectRequestsWithMoreThanOneHundredSourceInputs() throws Exception {
        var auth = identityService.register(
                "osc-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple", "overview-subject-controller",
                new DeviceCommand("overview-subject-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
        String source = "{\"sourceId\":\"00000000-0000-0000-0000-000000000001\","
                + "title\":\"Source\",\"outline\":[],\"summary\":null}";

        mockMvc.perform(post("/api/ai/subject-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"mode\":\"SUMMARY\",\"sources\":[" + String.join(",",
                                java.util.Collections.nCopies(101, source)) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
