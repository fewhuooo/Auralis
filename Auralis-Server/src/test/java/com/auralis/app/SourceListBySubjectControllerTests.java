package com.auralis.app;

import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.support.AuthTestAccounts;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SourceListBySubjectControllerTests {

    @Autowired private MockMvc mockMvc;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void filtersActiveSourcesBeforePaginationAndKeepsCursorsInTheirListScope() throws Exception {
        var owner = register();
        UUID userId = owner.user().id();
        UUID subjectId = subjectService.create(userId, new SubjectCommand("Target", null, null, "001")).id();
        UUID otherSubjectId = subjectService.create(userId, new SubjectCommand("Other", null, null, "002")).id();
        var older = createSource(userId, subjectId, "Older");
        var newer = createSource(userId, subjectId, "Newer");
        var unrelated = createSource(userId, otherSubjectId, "Unrelated");
        var deleted = createSource(userId, subjectId, "Deleted");
        sourceService.delete(userId, deleted.id(), deleted.version());
        setUpdatedAt(older.id(), "2026-01-01T00:00:00Z");
        setUpdatedAt(newer.id(), "2026-01-02T00:00:00Z");
        setUpdatedAt(unrelated.id(), "2026-01-03T00:00:00Z");
        setUpdatedAt(deleted.id(), "2026-01-04T00:00:00Z");

        String scopedCursor = nextCursor(list(owner, subjectId, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(newer.id().toString()))
                .andExpect(jsonPath("$.hasMore").value(true)));
        list(owner, subjectId, scopedCursor)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(older.id().toString()))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());

        String ownerCursor = nextCursor(list(owner, null, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(unrelated.id().toString()))
                .andExpect(jsonPath("$.hasMore").value(true)));
        list(owner, null, ownerCursor)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(newer.id().toString()));

        list(owner, null, scopedCursor)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        list(owner, otherSubjectId, scopedCursor)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        list(owner, subjectId, ownerCursor)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void requiresAnActiveSubjectOwnedByTheAuthenticatedAccount() throws Exception {
        var owner = register();
        var outsider = register();
        UUID userId = owner.user().id();
        var subject = subjectService.create(userId, new SubjectCommand("Private", null, null, "001"));
        createSource(userId, subject.id(), "Private source");

        list(outsider, subject.id(), null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        subjectService.delete(userId, subject.id(), subject.version());
        list(owner, subject.id(), null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    private AuthResult register() {
        String username = "source-read-" + UUID.randomUUID();
        return AuthTestAccounts.register(identityService, username, "Source.Read!2026",
                new DeviceCommand(username, "Source list test", DevicePlatform.WEB));
    }

    private SourceView createSource(UUID userId, UUID subjectId, String title) {
        return sourceService.create(userId, new SourceCommand(
                subjectId, SourceType.TEXT, title, null, null, "Example source text", null));
    }

    private void setUpdatedAt(UUID id, String updatedAt) {
        jdbcTemplate.update("update sources set updated_at = ? where id = ?", OffsetDateTime.parse(updatedAt), id);
    }

    private ResultActions list(AuthResult auth, UUID subjectId, String cursor) throws Exception {
        var request = get("/api/sources")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
                .param("limit", "1");
        if (subjectId != null) {
            request.param("subjectId", subjectId.toString());
        }
        if (cursor != null) {
            request.param("cursor", cursor);
        }
        return mockMvc.perform(request);
    }

    private String nextCursor(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.nextCursor");
    }
}
