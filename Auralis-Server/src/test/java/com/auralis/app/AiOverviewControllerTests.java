package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewGenerationService;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewTaskDeadline;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(AiOverviewControllerTests.OverviewTestConfiguration.class)
class AiOverviewControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private OverviewGenerationService generationService;

    @TestConfiguration
    static class OverviewTestConfiguration {
        @Bean
        @Primary
        OverviewGenerationService overviewGenerationServiceForControllerTest() {
            return mock(OverviewGenerationService.class);
        }
    }

    @Test
    void rejectsOverlongSourceOverviewInstructionsBeforeGeneration() throws Exception {
        var auth = AuthTestAccounts.register(identityService, "oc-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple",
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
    void rejectsSubjectRequestsWithNoSourceInputs() throws Exception {
        var auth = AuthTestAccounts.register(identityService, "osc-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple",
                new DeviceCommand("overview-subject-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
        mockMvc.perform(post("/api/ai/subject-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"mode\":\"SUMMARY\",\"sources\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void returnsValidSubjectOverviewAsJsonOverHttp() throws Exception {
        var auth = AuthTestAccounts.register(identityService, "osj-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple",
                new DeviceCommand("overview-subject-json-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        String requestId = "controller-json-" + UUID.randomUUID();
        var expected = new OverviewDtos.OverviewResponse(2, "Subject overview", null, "## Overview summary");
        var request = new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null,
                List.of(new OverviewDtos.SubjectOverviewSourceInput(sourceId, "Source", null, "Source summary")));
        when(generationService.generateSubject(eq(auth.user().id()), eq(request),
                eq(requestId), isNull(), any(OverviewTaskDeadline.class))).thenReturn(expected);

        mockMvc.perform(post("/api/ai/subject-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                        .header("X-Overview-Request-Id", requestId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectId\":\"" + subjectId + "\",\"mode\":\"SUMMARY\",\"sources\":[{"
                                + "\"sourceId\":\"" + sourceId + "\",\"title\":\"Source\",\"summaryMarkdown\":\"Source summary\"}]}"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.schemaVersion").value(2))
                .andExpect(jsonPath("$.title").value("Subject overview"))
                .andExpect(jsonPath("$.outlineMarkdown").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.summaryMarkdown").value("## Overview summary"));

        verify(generationService).generateSubject(eq(auth.user().id()), eq(request),
                eq(requestId), isNull(), any(OverviewTaskDeadline.class));
    }

    @Test
    void unsupportedSubjectOverviewAcceptReturns406ProblemDetails() throws Exception {
        var auth = AuthTestAccounts.register(identityService, "osj-accept-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple",
                new DeviceCommand("overview-subject-accept-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));

        mockMvc.perform(post("/api/ai/subject-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .header(HttpHeaders.ACCEPT, "image/png")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectId\":\"" + UUID.randomUUID()
                                + "\",\"mode\":\"SUMMARY\",\"sources\":[{\"sourceId\":\""
                                + UUID.randomUUID() + "\",\"title\":\"Source\",\"summaryMarkdown\":\"Source summary\"}] }"))
                .andExpect(status().isNotAcceptable())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("NOT_ACCEPTABLE"));
    }
}
