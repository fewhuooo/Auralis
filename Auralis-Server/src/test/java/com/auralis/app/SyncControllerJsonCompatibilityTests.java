package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

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
    private ObjectMapper objectMapper;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private TaskService taskService;

    @Test
    void acceptsAnObjectPayloadAtTheSyncHttpBoundary() throws Exception {
        AuthResult auth = AuthTestAccounts.register(identityService, "sync-json-" + UUID.randomUUID(),
                "sync-json-password",
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

    @Test
    void duplicateCreateReturnsAnItemRejectionWithoutInterruptingTheHttpBatch() throws Exception {
        AuthResult auth = AuthTestAccounts.register(identityService, "sync-duplicate-" + UUID.randomUUID(), "sync-json-password", new DeviceCommand("sync-duplicate", "Sync JSON", DevicePlatform.WEB));
        UUID userId = auth.user().id();
        var existing = subjectService.create(userId, new SubjectCommand("Original", null, null, "001"));
        UUID followingId = UUID.randomUUID();

        mockMvc.perform(post("/api/sync/push")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"serverDeviceId":"%s","mutations":[{
                                  "clientMutationId":"duplicate","resourceType":"SUBJECT",
                                  "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
                                  "payload":{"name":"Replacement"}
                                },{
                                  "clientMutationId":"following","resourceType":"SUBJECT",
                                  "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
                                  "payload":{"name":"Following"}
                                }]}
                                """.formatted(auth.serverDeviceId(), existing.id(), followingId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("REJECTED"))
                .andExpect(jsonPath("$.results[0].code").value("MUTATION_REJECTED"))
                .andExpect(jsonPath("$.results[0].current").doesNotExist())
                .andExpect(jsonPath("$.results[0].changeCursor").doesNotExist())
                .andExpect(jsonPath("$.results[1].decision").value("APPLIED"));

        org.assertj.core.api.Assertions.assertThat(subjectService.get(userId, existing.id()).name())
                .isEqualTo("Original");
        org.assertj.core.api.Assertions.assertThat(subjectService.get(userId, followingId).name())
                .isEqualTo("Following");
    }

    @Test
    void rollbackOnlyDomainFailuresBecomeReplayableItemReceiptsAndTheBatchContinues() throws Exception {
        AuthResult auth = AuthTestAccounts.register(identityService, "sync-rejections-" + UUID.randomUUID(), "sync-json-password", new DeviceCommand("sync-rejections", "Sync JSON", DevicePlatform.WEB));
        UUID userId = auth.user().id();
        var initial = subjectService.create(userId, new SubjectCommand("Original", null, null, "001"));
        var latest = subjectService.update(userId, initial.id(), initial.version(),
                new SubjectCommand("Edited elsewhere", null, null, "001"));
        UUID followingId = UUID.randomUUID();
        String authorization = "Bearer " + auth.tokens().accessToken();
        String body = """
                {"serverDeviceId":"%s","mutations":[{
                  "clientMutationId":"stale-delete","resourceType":"SUBJECT",
                  "resourceId":"%s","mutationType":"DELETE","baseVersion":%d
                },{
                  "clientMutationId":"missing-update","resourceType":"SUBJECT",
                  "resourceId":"%s","mutationType":"UPDATE","baseVersion":0,
                  "payload":{"name":"Missing"}
                },{
                  "clientMutationId":"following-create","resourceType":"SUBJECT",
                  "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
                  "payload":{"name":"Following"}
                }]}
                """.formatted(auth.serverDeviceId(), initial.id(), initial.version(), UUID.randomUUID(), followingId);

        var first = mockMvc.perform(post("/api/sync/push").header(HttpHeaders.AUTHORIZATION, authorization)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("CONFLICT"))
                .andExpect(jsonPath("$.results[0].code").value("RESOURCE_VERSION_CONFLICT"))
                .andExpect(jsonPath("$.results[0].current.version").value(latest.version()))
                .andExpect(jsonPath("$.results[0].changeCursor").doesNotExist())
                .andExpect(jsonPath("$.results[1].decision").value("REJECTED"))
                .andExpect(jsonPath("$.results[1].code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.results[1].changeCursor").doesNotExist())
                .andExpect(jsonPath("$.results[2].decision").value("APPLIED"))
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(subjectService.get(userId, initial.id()).version())
                .isEqualTo(latest.version());
        org.assertj.core.api.Assertions.assertThat(subjectService.get(userId, followingId).name()).isEqualTo("Following");

        subjectService.update(userId, initial.id(), latest.version(), new SubjectCommand("Edited again", null, null, "001"));
        var replay = mockMvc.perform(post("/api/sync/push").header(HttpHeaders.AUTHORIZATION, authorization)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(objectMapper.readTree(replay).get("results"))
                .isEqualTo(objectMapper.readTree(first).get("results"));
    }

    @Test
    void appliesAndReplaysLegacyKnowledgeBlockPayloadWithRemovedFields() throws Exception {
        AuthResult auth = AuthTestAccounts.register(identityService, "sync-legacy-kb-" + UUID.randomUUID(),
                "sync-json-password",
                new DeviceCommand("sync-legacy-kb-device-" + UUID.randomUUID(), "Sync JSON", DevicePlatform.WEB));
        UUID subjectId = subjectService.create(auth.user().id(),
                new SubjectCommand("Sync legacy subject", null, null, "001")).id();
        UUID knowledgeBlockId = UUID.randomUUID();
        String body = """
                {"serverDeviceId":"%s","mutations":[{
                  "clientMutationId":"legacy-kb-create-1","resourceType":"KNOWLEDGE_BLOCK",
                  "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
                  "payload":{"subjectId":"%s","sourceId":null,"title":"Imported note",
                    "content":"User-authored body","colorOverride":null,
                    "summary":"Legacy generated summary","tags":["legacy-tag"]}
                }]}
                """.formatted(auth.serverDeviceId(), knowledgeBlockId, subjectId);

        var first = mockMvc.perform(post("/api/sync/push")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("APPLIED"))
                .andExpect(jsonPath("$.results[0].current.content").value("User-authored body"))
                .andReturn();

        String firstCursor = com.jayway.jsonpath.JsonPath.read(
                first.getResponse().getContentAsString(), "$.results[0].changeCursor");
        mockMvc.perform(post("/api/sync/push")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("APPLIED"))
                .andExpect(jsonPath("$.results[0].changeCursor").value(firstCursor))
                .andExpect(jsonPath("$.results[0].current.content").value("User-authored body"));
    }

    @Test
    void rejectsTaskDeadlineOverrunFromSyncWithoutCreatingOrUpdatingRows() throws Exception {
        AuthResult auth = AuthTestAccounts.register(identityService, "sync-task-deadline-" + UUID.randomUUID(),
                "sync-json-password",
                new DeviceCommand("sync-task-deadline-device-" + UUID.randomUUID(), "Sync deadline", DevicePlatform.WEB));
        UUID subjectId = subjectService.create(auth.user().id(),
                new SubjectCommand("Sync deadline subject", null, null, "001")).id();
        UUID rejectedCreateId = UUID.randomUUID();
        String rejectedCreate = """
                {"serverDeviceId":"%s","mutations":[{
                  "clientMutationId":"task-deadline-create-1","resourceType":"TASK",
                  "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
                  "payload":{"subjectId":"%s","title":"Late sync create","status":"TODO",
                    "scheduledAt":"2026-09-25T08:00:00Z","dueAt":"2026-09-25T08:29:00Z",
                    "durationMinutes":30,"sortKey":"001"}
                }]}
                """.formatted(auth.serverDeviceId(), rejectedCreateId, subjectId);

        mockMvc.perform(post("/api/sync/push")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON).content(rejectedCreate))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("REJECTED"))
                .andExpect(jsonPath("$.results[0].code").value("VALIDATION_FAILED"));
        org.assertj.core.api.Assertions.assertThat(taskService.isOwnedTask(auth.user().id(), rejectedCreateId)).isFalse();

        var existing = taskService.create(auth.user().id(), new TaskCommand(subjectId, "Existing", null,
                TaskStatus.TODO, java.time.Instant.parse("2026-09-25T10:00:00Z"), null, 30, "002"));
        String rejectedUpdate = """
                {"serverDeviceId":"%s","mutations":[{
                  "clientMutationId":"task-deadline-update-1","resourceType":"TASK",
                  "resourceId":"%s","mutationType":"UPDATE","baseVersion":0,
                  "payload":{"subjectId":"%s","title":"Existing","description":null,"status":"TODO",
                    "scheduledAt":"2026-09-25T10:00:00Z","dueAt":"2026-09-25T10:29:00Z",
                    "durationMinutes":30,"sortKey":"002"}
                }]}
                """.formatted(auth.serverDeviceId(), existing.id(), subjectId);

        mockMvc.perform(post("/api/sync/push")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                        .contentType(MediaType.APPLICATION_JSON).content(rejectedUpdate))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].decision").value("REJECTED"))
                .andExpect(jsonPath("$.results[0].code").value("VALIDATION_FAILED"));

        var unchanged = taskService.get(auth.user().id(), existing.id());
        org.assertj.core.api.Assertions.assertThat(unchanged.version()).isEqualTo(existing.version());
        org.assertj.core.api.Assertions.assertThat(unchanged.scheduledAt()).isEqualTo(existing.scheduledAt());
        org.assertj.core.api.Assertions.assertThat(unchanged.dueAt()).isNull();
    }
}
