package com.auralis.app;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SourceAssetRelationControllerTests {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private RelationRepository relationRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

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
    void newBusinessRoutesRequireAnAccessToken() throws Exception {
        mockMvc.perform(get("/api/sources")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/relations")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/assets/upload-intents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"originalName\":\"notes.md\","
                                + "\"sizeBytes\":20,\"mimeType\":\"text/markdown\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sourceAssetAndRelationControllersReturnDirectDtosAndListEnvelopes() throws Exception {
        JsonNode registered = register("owner@example.com", "owner-device");
        String token = bearer(registered.path("tokens").path("accessToken").asText());
        String subjectId = json(mockMvc.perform(post("/api/subjects")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"name\":\"Source Subject\",\"sortKey\":\"001\"}"))
                .andExpect(status().isCreated())
                .andReturn()).path("id").asText();

        JsonNode intent = json(mockMvc.perform(post("/api/assets/upload-intents")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"originalName\":\"notes.md\","
                                + "\"sizeBytes\":20,\"mimeType\":\"text/markdown\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION,
                        org.hamcrest.Matchers.startsWith("/api/assets/")))
                .andReturn());
        String assetId = intent.path("assetId").asText();

        mockMvc.perform(post("/api/assets/{id}/complete", assetId)
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UPLOAD_VALIDATION_FAILED"));

        JsonNode source = json(mockMvc.perform(post("/api/sources")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"subjectId\":\"" + subjectId
                                + "\",\"type\":\"TEXT\",\"title\":\"Study note\","
                                + "\"rawText\":\"A source note\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION,
                        org.hamcrest.Matchers.startsWith("/api/sources/")))
                .andExpect(jsonPath("$.ingestionStatus").value("PENDING"))
                .andExpect(jsonPath("$.ingestionRevision").isNotEmpty())
                .andReturn());
        String sourceId = source.path("id").asText();

        mockMvc.perform(post("/api/relations")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseVersion\":0,\"sourceType\":\"SUBJECT\","
                                + "\"sourceId\":\"" + subjectId + "\",\"targetType\":\"SOURCE\","
                                + "\"targetId\":\"" + sourceId + "\",\"type\":\"REFERENCES\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("REFERENCES"));

        mockMvc.perform(get("/api/sources")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasMore").value(false));
        mockMvc.perform(get("/api/relations")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1));

        assertThat(sourceId).isNotBlank();
    }

    private JsonNode register(String username, String clientDeviceKey) throws Exception {
        return json(mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username
                                + "\",\"password\":\"correct horse battery staple\","
                                + "\"displayName\":\"Owner\",\"clientDeviceKey\":\"" + clientDeviceKey
                                + "\",\"deviceName\":\"Browser\",\"platform\":\"WEB\"}"))
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
