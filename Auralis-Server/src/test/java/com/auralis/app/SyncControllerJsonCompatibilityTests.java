package com.auralis.app;

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

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private TaskService taskService;

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

    @Test
    void appliesAndReplaysLegacyKnowledgeBlockPayloadWithRemovedFields() throws Exception {
        AuthResult auth = identityService.register(
                "sync-legacy-kb-" + UUID.randomUUID(),
                "sync-json-password",
                "Sync JSON",
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
        AuthResult auth = identityService.register(
                "sync-task-deadline-" + UUID.randomUUID(),
                "sync-json-password",
                "Sync deadline",
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
