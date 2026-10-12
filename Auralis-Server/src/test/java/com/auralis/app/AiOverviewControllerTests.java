package com.auralis.app;

import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewGenerationService;
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

    @Test
    void returnsValidSubjectOverviewAsJsonOverHttp() throws Exception {
        var auth = identityService.register(
                "osj-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple", "overview-subject-json-controller",
                new DeviceCommand("overview-subject-json-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        String requestId = "controller-json-" + UUID.randomUUID();
        var expected = new OverviewDtos.OverviewResponse(1, "Subject overview",
                List.of(new OverviewDtos.OverviewChapter("Chapter 1", List.of(
                        new OverviewDtos.OverviewSection("Section 1", "Section summary",
                                List.of(sourceId.toString()), new OverviewDtos.OverviewLocator(4, "block-1"))))),
                new OverviewDtos.OverviewSummary("Overview summary", List.of("Key point"), List.of("Learning step")));
        when(generationService.generateSubject(eq(auth.user().id()), any(OverviewDtos.SubjectOverviewRequest.class),
                eq(requestId), isNull(), any(OverviewTaskDeadline.class))).thenReturn(expected);

        mockMvc.perform(post("/api/ai/subject-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                        .header("X-Overview-Request-Id", requestId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectId\":\"" + subjectId + "\",\"mode\":\"ALL\",\"sources\":[{"
                                + "\"sourceId\":\"" + sourceId + "\",\"title\":\"Source\",\"outline\":[],\"summary\":null}]}"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.title").value("Subject overview"))
                .andExpect(jsonPath("$.outline[0].sections[0].sourceIds[0]").value(sourceId.toString()))
                .andExpect(jsonPath("$.summary.learningPath[0]").value("Learning step"));

        verify(generationService).generateSubject(eq(auth.user().id()), any(OverviewDtos.SubjectOverviewRequest.class),
                eq(requestId), isNull(), any(OverviewTaskDeadline.class));
    }

    @Test
    void unsupportedSubjectOverviewAcceptReturns406ProblemDetails() throws Exception {
        var auth = identityService.register(
                "osj-accept-" + UUID.randomUUID() + "@example.com",
                "correct horse battery staple", "overview-subject-accept-device",
                new DeviceCommand("overview-subject-accept-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));

        mockMvc.perform(post("/api/ai/subject-overviews")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .header(HttpHeaders.ACCEPT, "image/png")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectId\":\"" + UUID.randomUUID()
                                + "\",\"mode\":\"ALL\",\"sources\":[{\"sourceId\":\""
                                + UUID.randomUUID() + "\",\"title\":\"Source\",\"outline\":[],\"summary\":null}] }"))
                .andExpect(status().isNotAcceptable())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("NOT_ACCEPTABLE"));
    }
}
