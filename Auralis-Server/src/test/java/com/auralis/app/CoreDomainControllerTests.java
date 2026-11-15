package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
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
    private UserRepository userRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void cleanData() {
        relationRepository.deleteAll();
        knowledgeBlockRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
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
                                + "\",\"title\":\"Vectors\",\"content\":\"A vector has direction\","
                                + "\"summary\":\"legacy summary\",\"tags\":[\"math\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.subjectId").value(subjectId))
                .andExpect(jsonPath("$.content").value("A vector has direction"))
                .andExpect(jsonPath("$.summary").doesNotExist())
                .andExpect(jsonPath("$.tags").doesNotExist());

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
    void taskCreateRejectsAnOverlappingScheduleInterval() throws Exception {
        JsonNode registered = register("schedule-overlap-api@example.com", "schedule-overlap-api-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Schedule overlap API");
        createScheduledTask(token, subjectId, "First", "2026-08-27T08:00:00.000Z");

        mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Overlap\",\"scheduledAt\":\"2026-08-27T08:15:00.000Z\","
                                + "\"durationMinutes\":30}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void taskScheduleInsertionReturnsChangedTasksAndRejectsOverflowAtomically() throws Exception {
        JsonNode registered = register("schedule-insertion-api@example.com", "schedule-insertion-api-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Schedule insertion API");
        JsonNode existing = createScheduledTask(token, subjectId, "Existing", "2026-08-27T09:00:00.000Z");
        JsonNode inserted = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Inserted\",\"durationMinutes\":60}"))
                .andExpect(status().isCreated())
                .andReturn());

        mockMvc.perform(post("/api/tasks/schedule-insertions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"taskId\":\"" + inserted.path("id").asText()
                                + "\",\"baseVersion\":0,\"scheduledAt\":\"2026-08-27T09:00:00Z\""
                                + ",\"windowStartAt\":\"2026-08-27T08:00:00Z\""
                                + ",\"windowLastStartAt\":\"2026-08-27T22:30:00Z\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.length()").value(2))
                .andExpect(jsonPath("$.tasks[0].id").value(inserted.path("id").asText()))
                .andExpect(jsonPath("$.tasks[0].scheduledAt").value("2026-08-27T09:00:00Z"))
                .andExpect(jsonPath("$.tasks[1].id").value(existing.path("id").asText()))
                .andExpect(jsonPath("$.tasks[1].scheduledAt").value("2026-08-27T10:00:00Z"));

        JsonNode lastSlot = createScheduledTask(token, subjectId, "Last slot", "2026-08-27T22:30:00.000Z");
        JsonNode overflow = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Overflow\",\"durationMinutes\":60}"))
                .andExpect(status().isCreated())
                .andReturn());
        mockMvc.perform(post("/api/tasks/schedule-insertions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"taskId\":\"" + overflow.path("id").asText()
                                + "\",\"baseVersion\":0,\"scheduledAt\":\"2026-08-27T22:00:00Z\""
                                + ",\"windowStartAt\":\"2026-08-27T08:00:00Z\""
                                + ",\"windowLastStartAt\":\"2026-08-27T22:30:00Z\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/tasks/{id}", lastSlot.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T22:30:00Z"));
        mockMvc.perform(get("/api/tasks/{id}", overflow.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").doesNotExist());
    }

    @Test
    void strictTaskScheduleInsertionRejectsInvalidModeSlotAndTargetCombination() throws Exception {
        JsonNode registered = register("strict-schedule-api@example.com", "strict-schedule-api-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Strict placement");
        JsonNode task = createScheduledTask(token, subjectId, "Source", "2026-10-06T09:00:00+08:00");
        JsonNode target = createScheduledTask(token, subjectId, "Target", "2026-10-06T09:30:00+08:00");
        String insertion = """
                {"taskId":"%s","baseVersion":%d,"scheduledAt":"%s",
                 "windowStartAt":"2026-10-06T08:00:00+08:00","windowLastStartAt":"2026-10-06T22:30:00+08:00",
                 %s}
                """;
        String taskId = task.path("id").asText();
        long version = task.path("version").asLong();
        for (String invalidRequest : java.util.List.of(
                insertion.formatted(taskId, version, "2026-10-06T08:00:00+08:00", "\"placementMode\":\"UNKNOWN\""),
                insertion.formatted(taskId, version, "2026-10-06T08:00:00+08:00", "\"placementMode\":0"),
                insertion.formatted(taskId, version, "2026-10-06T08:15:00+08:00", "\"placementMode\":\"STRICT\""),
                insertion.formatted(taskId, version, "2026-10-06T07:30:00+08:00", "\"placementMode\":\"STRICT\""),
                insertion.formatted(taskId, version, "2026-10-06T10:00:00+08:00",
                        "\"placementMode\":\"STRICT\",\"targetTaskId\":\"" + target.path("id").asText() + "\""))) {
            mockMvc.perform(post("/api/tasks/schedule-insertions")
                            .header(HttpHeaders.AUTHORIZATION, token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(invalidRequest))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }

        mockMvc.perform(get("/api/tasks/{id}", taskId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-10-06T01:00:00Z"))
                .andExpect(jsonPath("$.version").value((int) version));
    }

    @Test
    void taskScheduleInsertionWithTargetTaskIdPlacesOnlyDraggedTaskAfterTarget() throws Exception {
        JsonNode registered = register("schedule-insertion-target-api@example.com", "schedule-insertion-target-api-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Schedule insertion target API");
        JsonNode target = createScheduledTask(token, subjectId, "Target", "2026-08-27T09:00:00.000Z");
        JsonNode inserted = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Inserted\",\"durationMinutes\":60}"))
                .andExpect(status().isCreated())
                .andReturn());

        mockMvc.perform(post("/api/tasks/schedule-insertions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"taskId\":\"" + inserted.path("id").asText()
                                + "\",\"targetTaskId\":\"" + target.path("id").asText()
                                + "\",\"baseVersion\":0,\"scheduledAt\":\"2026-08-27T09:30:00Z\""
                                + ",\"windowStartAt\":\"2026-08-27T08:00:00Z\""
                                + ",\"windowLastStartAt\":\"2026-08-27T22:30:00Z\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.length()").value(1))
                .andExpect(jsonPath("$.tasks[0].id").value(inserted.path("id").asText()))
                .andExpect(jsonPath("$.tasks[0].scheduledAt").value("2026-08-27T09:30:00Z"));

        mockMvc.perform(get("/api/tasks/{id}", target.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T09:00:00Z"));
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

    @Test
    void taskScheduleEndpointsRejectDeadlineOverrunAndKeepAllRowsUnchanged() throws Exception {
        JsonNode registered = register("schedule-deadline-api@example.com", "schedule-deadline-api-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = createSubject(token, "Schedule deadline");

        mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Late create\",\"scheduledAt\":\"2026-08-27T16:00:00+08:00\""
                                + ",\"dueAt\":\"2026-08-27T08:29:00Z\",\"durationMinutes\":30}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        JsonNode exactEnd = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Exact end\",\"scheduledAt\":\"2026-08-27T16:00:00+08:00\""
                                + ",\"dueAt\":\"2026-08-27T08:30:00Z\",\"durationMinutes\":30}"))
                .andExpect(status().isCreated())
                .andReturn());
        assertThat(exactEnd.path("scheduledAt").asText()).isEqualTo("2026-08-27T08:00:00Z");

        mockMvc.perform(put("/api/tasks/{id}", exactEnd.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Exact end\",\"status\":\"TODO\","
                                + "\"scheduledAt\":\"2026-08-27T16:00:00+08:00\","
                                + "\"dueAt\":\"2026-08-27T08:29:00+00:00\",\"durationMinutes\":30}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(put("/api/tasks/{id}", exactEnd.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Exact end\",\"status\":\"TODO\","
                                + "\"scheduledAt\":\"2026-08-27T16:00:00+08:00\","
                                + "\"dueAt\":\"2026-08-27T08:30:00Z\",\"durationMinutes\":60}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/tasks/{id}", exactEnd.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T08:00:00Z"))
                .andExpect(jsonPath("$.dueAt").value("2026-08-27T08:30:00Z"))
                .andExpect(jsonPath("$.durationMinutes").value(30))
                .andExpect(jsonPath("$.version").value(0));

        JsonNode source = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Swap source\",\"scheduledAt\":\"2026-08-27T10:00:00Z\""
                                + ",\"dueAt\":\"2026-08-27T11:00:00Z\",\"durationMinutes\":30}"))
                .andExpect(status().isCreated())
                .andReturn());
        JsonNode target = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Swap target\",\"scheduledAt\":\"2026-08-27T12:00:00Z\""
                                + ",\"dueAt\":\"2026-08-27T12:30:00Z\",\"durationMinutes\":30}"))
                .andExpect(status().isCreated())
                .andReturn());
        mockMvc.perform(post("/api/tasks/schedule-swaps")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sourceTaskId\":\"" + source.path("id").asText()
                                + "\",\"sourceBaseVersion\":0,\"targetTaskId\":\""
                                + target.path("id").asText() + "\",\"targetBaseVersion\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/tasks/{id}", source.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T10:00:00Z"))
                .andExpect(jsonPath("$.version").value(0));
        mockMvc.perform(get("/api/tasks/{id}", target.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T12:00:00Z"))
                .andExpect(jsonPath("$.version").value(0));

        JsonNode dueTask = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Shifted task\",\"scheduledAt\":\"2026-08-27T14:00:00Z\""
                                + ",\"dueAt\":\"2026-08-27T14:30:00Z\",\"durationMinutes\":30}"))
                .andExpect(status().isCreated())
                .andReturn());
        JsonNode inserted = json(mockMvc.perform(post("/api/tasks")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"title\":\"Inserted\",\"durationMinutes\":60}"))
                .andExpect(status().isCreated())
                .andReturn());
        mockMvc.perform(post("/api/tasks/schedule-insertions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"taskId\":\"" + inserted.path("id").asText()
                                + "\",\"baseVersion\":0,\"scheduledAt\":\"2026-08-27T14:00:00Z\""
                                + ",\"windowStartAt\":\"2026-08-27T08:00:00Z\""
                                + ",\"windowLastStartAt\":\"2026-08-27T22:30:00Z\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mockMvc.perform(get("/api/tasks/{id}", dueTask.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-27T14:00:00Z"))
                .andExpect(jsonPath("$.dueAt").value("2026-08-27T14:30:00Z"))
                .andExpect(jsonPath("$.version").value(0));
        mockMvc.perform(get("/api/tasks/{id}", inserted.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").doesNotExist())
                .andExpect(jsonPath("$.version").value(0));
    }

    private org.springframework.test.web.servlet.ResultActions updateTask(
            String token, String subjectId, JsonNode task, String scheduledAt, String dueAt, int durationMinutes)
            throws Exception {
        return mockMvc.perform(put("/api/tasks/{id}", task.path("id").asText())
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                        + "\",\"title\":\"" + task.path("title").asText()
                        + "\",\"status\":\"TODO\",\"scheduledAt\":\"" + scheduledAt
                        + "\",\"dueAt\":\"" + dueAt + "\",\"durationMinutes\":" + durationMinutes
                        + ",\"sortKey\":\"api\"}"));
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
        String verification = AuthTestAccounts.registrationFields(mockMvc, AuthTestAccounts.newEmail());
        return json(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{" + verification + "\"username\":\"" + username.split("@", 2)[0]
                                + "\",\"password\":\"correct horse battery staple\",\"clientDeviceKey\":\""
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
