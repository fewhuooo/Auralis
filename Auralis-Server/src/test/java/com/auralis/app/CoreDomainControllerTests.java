package com.auralis.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
        String subjectId = json(mockMvc.perform(get("/api/subjects")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()", org.hamcrest.Matchers.is(1)))
                .andReturn()).path("items").get(0).path("id").asText();

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
                                + "\",\"title\":\"Review vectors\",\"durationMinutes\":30,\"cognitiveLoad\":\"MEDIUM\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("TODO"))
                .andExpect(jsonPath("$.durationMinutes").value(30));

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

    private JsonNode register(String username, String deviceId) throws Exception {
        return json(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username
                                + "\",\"password\":\"correct horse battery staple\",\"displayName\":\"Owner\",\"deviceId\":\""
                                + deviceId + "\",\"deviceName\":\"Browser\",\"platform\":\"WEB\"}"))
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
