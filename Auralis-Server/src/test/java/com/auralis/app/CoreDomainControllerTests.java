package com.auralis.app;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.internal.persistence.TaskRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class CoreDomainControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private UserRepository userRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void cleanData() {
        knowledgeBlockRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void subjectCrudUsesAuthenticatedOwnerAndExactVersions() throws Exception {
        JsonNode alice = register("alice@example.com", "alice-device");
        JsonNode bob = register("bob@example.com", "bob-device");
        String aliceToken = bearer(alice.path("tokens").path("accessToken").asText());
        String bobToken = bearer(bob.path("tokens").path("accessToken").asText());

        JsonNode created = json(mockMvc.perform(post("/api/subjects")
                        .header(HttpHeaders.AUTHORIZATION, aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"name\":\"Physics\",\"sortKey\":\"001\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION,
                        org.hamcrest.Matchers.startsWith("/api/subjects/")))
                .andReturn());
        String id = created.path("id").asText();
        assertThat(created.path("version").asLong()).isZero();
        assertThat(created.has("color")).isFalse();

        mockMvc.perform(put("/api/subjects/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"name\":\"Physics II\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(put("/api/subjects/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"name\":\"Stale\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESOURCE_VERSION_CONFLICT"))
                .andExpect(jsonPath("$.current.id").value(id))
                .andExpect(jsonPath("$.current.version").value(1));

        mockMvc.perform(get("/api/subjects/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bobToken))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/subjects/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":1}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/subjects/{id}/restore", id)
                        .header(HttpHeaders.AUTHORIZATION, aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(3))
                .andExpect(jsonPath("$.name").value("Physics II"));
    }

    @Test
    void knowledgeBlocksAndTasksUseSubjectReferencesAndListEnvelopes() throws Exception {
        JsonNode registered = register("owner@example.com", "owner-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = json(mockMvc.perform(post("/api/subjects")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"name\":\"Vectors\",\"sortKey\":\"001\"}"))
                .andExpect(status().isCreated())
                .andReturn()).path("id").asText();

        mockMvc.perform(post("/api/knowledge-blocks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Vectors\",\"content\":\"A vector has direction\",\"tags\":[\"math\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.subjectId").value(subjectId))
                .andExpect(jsonPath("$.tags[0]").value("math"));

        mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Review vectors\",\"durationMinutes\":30}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("TODO"))
                .andExpect(jsonPath("$.durationMinutes").value(30))
                .andExpect(jsonPath("$.cognitiveLoad").doesNotExist());

        mockMvc.perform(get("/api/knowledge-blocks")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()", org.hamcrest.Matchers.is(1)))
                .andExpect(jsonPath("$.hasMore").value(false));
        mockMvc.perform(get("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()", org.hamcrest.Matchers.is(1)));
    }

    @Test
    void coreDomainRoutesRequireAnAccessToken() throws Exception {
        mockMvc.perform(get("/api/subjects")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/knowledge-blocks")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/tasks")).andExpect(status().isUnauthorized());
    }

    @Test
    void taskScheduledAtFormatErrorsAreReportedAsFieldValidationErrors() throws Exception {
        JsonNode registered = register("schedule-format@example.com", "schedule-format-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Schedule format");

        mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Malformed time\",\"scheduledAt\":\"Thu 08:30\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("scheduledAt"));
    }

    @Test
    void taskScheduleSwapIsAtomicAndLeavesNeitherTaskPartiallyChangedOnFailure() throws Exception {
        JsonNode registered = register("schedule-swap@example.com", "schedule-swap-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Schedule swap");
        JsonNode source = createScheduledTask(token, subjectId, "Source", "2026-08-27T08:00:00.000Z");
        JsonNode target = createScheduledTask(token, subjectId, "Target", "2026-08-27T09:00:00.000Z");

        mockMvc.perform(post("/api/tasks/schedule-swaps")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sourceTaskId\":\"" + source.path("id").asText()
                                + "\",\"sourceBaseVersion\":0,\"targetTaskId\":\"" + target.path("id").asText()
                                + "\",\"targetBaseVersion\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.scheduledAt").value("2026-08-27T09:00:00Z"))
                .andExpect(jsonPath("$.target.scheduledAt").value("2026-08-27T08:00:00Z"));

        mockMvc.perform(post("/api/tasks/schedule-swaps")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sourceTaskId\":\"" + source.path("id").asText()
                                + "\",\"sourceBaseVersion\":1,\"targetTaskId\":\"" + target.path("id").asText()
                                + "\",\"targetBaseVersion\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESOURCE_VERSION_CONFLICT"));

        mockMvc.perform(get("/api/tasks/{id}", source.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T09:00:00Z"))
                .andExpect(jsonPath("$.version").value(1));
        mockMvc.perform(get("/api/tasks/{id}", target.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T08:00:00Z"))
                .andExpect(jsonPath("$.version").value(1));
    }

    private String createSubject(String token, String name) throws Exception {
        return json(mockMvc.perform(post("/api/subjects")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"name\":\"" + name + "\",\"sortKey\":\"001\"}"))
                .andExpect(status().isCreated())
                .andReturn()).path("id").asText();
    }

    private JsonNode createScheduledTask(String token, String subjectId, String title, String scheduledAt) throws Exception {
        return json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"" + title + "\",\"scheduledAt\":\"" + scheduledAt
                                + "\",\"dueAt\":\"2026-12-31T00:00:00.000Z\"}"))
                .andExpect(status().isCreated())
                .andReturn());
    }

    private JsonNode register(String username, String clientDeviceKey) throws Exception {
        return json(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username
                                + "\",\"password\":\"correct horse battery staple\",\"displayName\":\"Owner\",\"clientDeviceKey\":\""
                                + clientDeviceKey + "\",\"deviceName\":\"Browser\",\"platform\":\"WEB\"}"))
                .andExpect(status().isCreated())
                .andReturn());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
