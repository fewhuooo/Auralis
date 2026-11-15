package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
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

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class FocusSessionControllerTests {

    @Autowired private MockMvc mockMvc;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private TaskService taskService;

    @Test
    void focusSessionsAreIdempotentOwnerScopedAndCountOnlyCompletedSessions() throws Exception {
        var registered = AuthTestAccounts.register(identityService, "focus-" + UUID.randomUUID(), "phase-three-password",
                new DeviceCommand("focus-device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB));
        String token = "Bearer " + registered.tokens().accessToken();
        UUID userId = registered.user().id();
        UUID subjectId = subjectService.create(userId, new SubjectCommand("Focus", null, null, "001")).id();
        UUID taskId = taskService.create(userId, new TaskCommand(subjectId, "Focus task", null,
                TaskStatus.TODO, null, null, null, "001")).id();
        Instant endedAt = Instant.now().minusSeconds(1);
        Instant startedAt = endedAt.minusSeconds(1800);
        UUID sessionId = UUID.randomUUID();
        String body = "{\"clientSessionId\":\"" + sessionId + "\",\"taskId\":\"" + taskId
                + "\",\"startedAt\":\"" + startedAt + "\",\"endedAt\":\"" + endedAt
                + "\",\"durationSeconds\":1200,\"completed\":true}";

        var first = mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.durationSeconds").value(1200))
                .andExpect(jsonPath("$.completed").value(true)).andReturn();
        String persistedId = com.jayway.jsonpath.JsonPath.read(first.getResponse().getContentAsString(), "$.id");
        var replay = mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(persistedId)).andReturn();

        mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("\"durationSeconds\":1200", "\"durationSeconds\":1199")))
                .andExpect(status().isConflict());

        Instant completedAt = Instant.parse(endedAt.toString());
        var overview = mockMvc.perform(get("/api/stats/overview").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.focusSeconds").value(1200))
                .andExpect(jsonPath("$.focusCompletedCount").value(1)).andReturn();
        assertThat(overview.getResponse().getContentAsString()).contains("focusSeconds");

        String interruptedBody = "{\"clientSessionId\":\"" + UUID.randomUUID() + "\",\"taskId\":null"
                + ",\"startedAt\":\"" + completedAt.minusSeconds(300) + "\",\"endedAt\":\"" + completedAt
                + "\",\"durationSeconds\":180,\"completed\":false}";
        mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON).content(interruptedBody))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/stats/overview").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.focusSeconds").value(1380))
                .andExpect(jsonPath("$.focusCompletedCount").value(1));
    }

    @Test
    void offlineFocusUploadsRemainValidAfterTaskCompletionOrDeletionButStayOwnerScoped() throws Exception {
        var owner = AuthTestAccounts.register(identityService, "focus-history-" + UUID.randomUUID(), "phase-three-password",
                new DeviceCommand("focus-history-device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB));
        String token = "Bearer " + owner.tokens().accessToken();
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Focus history", null, null, "001")).id();
        UUID completedTaskId = taskService.create(owner.user().id(), new TaskCommand(subjectId, "Completed", null,
                TaskStatus.TODO, null, null, null, "001")).id();
        taskService.update(owner.user().id(), completedTaskId, 0, new TaskCommand(subjectId, "Completed", null,
                TaskStatus.DONE, null, null, null, "001"));

        Instant endedAt = Instant.now().minusSeconds(1);
        Instant startedAt = endedAt.minusSeconds(900);
        mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sessionBody(UUID.randomUUID(), completedTaskId, startedAt, endedAt, 600, true)))
                .andExpect(status().isOk());

        UUID deletedTaskId = taskService.create(owner.user().id(), new TaskCommand(subjectId, "Deleted", null,
                TaskStatus.TODO, null, null, null, "002")).id();
        taskService.delete(owner.user().id(), deletedTaskId, 0);
        mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sessionBody(UUID.randomUUID(), deletedTaskId, startedAt, endedAt, 300, false)))
                .andExpect(status().isOk());

        var other = AuthTestAccounts.register(identityService, "focus-other-" + UUID.randomUUID(), "phase-three-password",
                new DeviceCommand("focus-other-device-" + UUID.randomUUID(), "Other Device", DevicePlatform.WEB));
        UUID otherSubjectId = subjectService.create(other.user().id(),
                new SubjectCommand("Other subject", null, null, "001")).id();
        UUID otherTaskId = taskService.create(other.user().id(), new TaskCommand(otherSubjectId, "Other task", null,
                TaskStatus.TODO, null, null, null, "001")).id();
        mockMvc.perform(post("/api/focus-sessions").header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sessionBody(UUID.randomUUID(), otherTaskId, startedAt, endedAt, 300, false)))
                .andExpect(status().isNotFound());
    }

    private String sessionBody(UUID sessionId, UUID taskId, Instant startedAt, Instant endedAt,
                               int durationSeconds, boolean completed) {
        return "{\"clientSessionId\":\"" + sessionId + "\",\"taskId\":\"" + taskId
                + "\",\"startedAt\":\"" + startedAt + "\",\"endedAt\":\"" + endedAt
                + "\",\"durationSeconds\":" + durationSeconds + ",\"completed\":" + completed + "}";
    }
}
