package com.auralis.app;

import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewResultCommand;
import com.auralis.app.ai.OverviewResultService;
import com.auralis.app.ai.OverviewInputDescriptor;
import com.auralis.app.ai.OverviewSourceManifestEntry;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OverviewResultControllerTests {
    @Autowired private MockMvc mockMvc;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private SourceRepository sourceRepository;
    @Autowired private OverviewResultService overviewResultService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void revokedWriteReceiptCannotReplayItsOldSnapshot() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Revoked receipt subject", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Revoked receipt source");
        var command = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null,
                fullResult("Receipt snapshot content"));
        String body = objectMapper.writeValueAsString(command);
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        jdbcTemplate.update("update overview_write_receipts set response_snapshot=? where user_id=? and client_write_id=?",
                "{\"revoked\":true}", owner.user().id(), command.clientWriteId());

        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void sourceResultCanPersistAConfiguredDynamicLengthTitle() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Long overview title subject", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Long title source");
        String longTitle = "动态标题".repeat(76);
        var result = fullResult(longTitle);
        var command = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, result);

        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForObject("select title from overview_results where user_id=? and scope_id=?",
                String.class, owner.user().id(), source.getId())).isEqualTo(longTitle);
    }

    @Test
    void sourceResultsFenceRevisionMergePartsAndPreserveCachedGenerationTimes() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Overview subject", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Original title");
        Instant cachedOutlineAt = Instant.parse("2026-09-01T10:00:00Z");
        Instant cachedSummaryAt = Instant.parse("2026-09-01T11:00:00Z");
        var firstCommand = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, cachedOutlineAt, cachedSummaryAt,
                fullResult("Original"));
        String firstBody = objectMapper.writeValueAsString(firstCommand);

        var first = mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.outlineVersion").value(1)).andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.schemaVersion").value(2)).andExpect(jsonPath("$.title").value("Original"))
                .andReturn();
        JsonNode firstJson = objectMapper.readTree(first.getResponse().getContentAsString());
        String persistedId = firstJson.path("id").asString();
        assertThat(firstJson.at("/outlineInputDescriptor/origin").asString()).isEqualTo("SOURCE_REVISION");
        assertThat(firstJson.at("/summaryInputDescriptor/origin").asString()).isEqualTo("SOURCE_REVISION");
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .param("ingestionRevision", source.getIngestionRevision().toString())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outlineGeneratedAt").value(cachedOutlineAt.toString()))
                .andExpect(jsonPath("$.summaryGeneratedAt").value(cachedSummaryAt.toString()));

        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(persistedId))
                .andExpect(jsonPath("$.version").value(1));

        UUID movedSubjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Moved subject", null, null, "002")).id();
        jdbcTemplate.update("update sources set subject_id = ?, ingestion_status = 'READY' where id = ?",
                movedSubjectId, source.getId());
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .param("ingestionRevision", source.getIngestionRevision().toString())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.subjectId").value(movedSubjectId.toString()));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(persistedId))
                .andExpect(jsonPath("$.subjectId").value(movedSubjectId.toString()))
                .andExpect(jsonPath("$.version").value(1));

        Instant nextOutlineAt = Instant.parse("2026-09-02T10:00:00Z");
        var partial = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.OUTLINE,
                source.getIngestionRevision(), null, null, nextOutlineAt, null,
                outlineOnlyResult("Updated outline"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.outlineVersion").value(2)).andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.summaryMarkdown").value("Summary Original"))
                .andExpect(jsonPath("$.outlineGeneratedAt").value(nextOutlineAt.toString()))
                .andExpect(jsonPath("$.summaryGeneratedAt").value(cachedSummaryAt.toString()));

        var summaryOnly = new OverviewResultCommand(2L, UUID.randomUUID(), OverviewMode.SUMMARY,
                source.getIngestionRevision(), null, null, null, Instant.parse("2026-09-03T11:00:00Z"),
                summaryOnlyResult("Updated summary"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(summaryOnly)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3))
                .andExpect(jsonPath("$.outlineVersion").value(2)).andExpect(jsonPath("$.summaryVersion").value(2))
                .andExpect(jsonPath("$.outlineMarkdown").value(outlineOnlyResult("Updated outline").outlineMarkdown()))
                .andExpect(jsonPath("$.summaryMarkdown").value("Updated summary"));

        mockMvc.perform(get("/api/overview-results/sources/{id}/outline", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/overview-results/sources/{id}/sections/{sectionId}", source.getId(), UUID.randomUUID())
                        .param("version", "3").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());

        UUID nextRevision = UUID.randomUUID();
        jdbcTemplate.update("update sources set ingestion_revision = ?, ingestion_status = 'READY' where id = ?",
                nextRevision, source.getId());
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .param("ingestionRevision", source.getIngestionRevision().toString())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        var reseed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                nextRevision, null, null, null, null, fullResult("New revision"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reseed)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(4))
                .andExpect(jsonPath("$.outlineVersion").value(3)).andExpect(jsonPath("$.summaryVersion").value(3));
    }

    @Test
    void legacyResultIsUnavailableUntilACompleteWriteMatchesItsPhysicalVersion() throws Exception {
        var owner = owner();
        UUID userId = owner.user().id();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(userId, new SubjectCommand("Legacy overview", null, null, "001")).id();
        SourceEntity source = createReadySource(userId, subjectId, "Legacy source");
        putSourceOverview(userId, token, source, 0, "Initial");
        String oldOutline = "[{\"title\":\"Legacy chapter\",\"sections\":[]}]";
        jdbcTemplate.update("update overview_results set schema_version=1, version=7, outline=?, summary=? where scope_id=?",
                oldOutline, "{\"overview\":\"Legacy summary\"}", source.getId());

        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        assertThat(overviewResultService.readCurrentSource(userId, source.getId(), source.getIngestionRevision())).isEmpty();
        assertThat(overviewResultService.currentSourceOverviewIds(userId,
                java.util.Map.of(source.getId(), source.getIngestionRevision()))).isEmpty();

        var stale = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, fullResult("New Markdown"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(stale)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.current.version").value(7))
                .andExpect(jsonPath("$.current.schemaVersion").value(1))
                .andExpect(jsonPath("$.current.outline").doesNotExist());
        var partial = new OverviewResultCommand(7L, UUID.randomUUID(), OverviewMode.OUTLINE,
                source.getIngestionRevision(), null, null, null, null, outlineOnlyResult("New Markdown"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial)))
                .andExpect(status().isConflict());
        assertThat(jdbcTemplate.queryForObject("select outline from overview_results where scope_id=?",
                String.class, source.getId())).isEqualTo(oldOutline);

        var replacement = new OverviewResultCommand(7L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, fullResult("New Markdown"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replacement)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(8))
                .andExpect(jsonPath("$.schemaVersion").value(2))
                .andExpect(jsonPath("$.outlineMarkdown").value(replacement.result().outlineMarkdown()))
                .andExpect(jsonPath("$.summaryMarkdown").value(replacement.result().summaryMarkdown()));

        jdbcTemplate.update("update overview_write_receipts set response_snapshot=? where client_write_id=?",
                "{\"schemaVersion\":1,\"outline\":[],\"summary\":{}}", replacement.clientWriteId());
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replacement)))
                .andExpect(status().isConflict());
    }

    @Test
    void invalidStoredMarkdownIsReportedAsAnInternalError() throws Exception {
        var owner = owner();
        UUID userId = owner.user().id();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(userId, new SubjectCommand("Corrupt overview", null, null, "001")).id();
        SourceEntity source = createReadySource(userId, subjectId, "Corrupt source");
        putSourceOverview(userId, token, source, 0, "Initial");
        jdbcTemplate.update("update overview_results set outline=? where scope_id=?", "[]", source.getId());

        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isInternalServerError());

        var partial = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.SUMMARY,
                source.getIngestionRevision(), null, null, null, null, summaryOnlyResult("Update"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial)))
                .andExpect(status().isInternalServerError());
        assertThat(jdbcTemplate.queryForObject("select version from overview_results where scope_id=?",
                Long.class, source.getId())).isEqualTo(1L);
    }

    @Test
    void currentSourceOverviewReadsOnlyTheOwnersCurrentFormalResult() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Current source overview", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Current source overview");
        putSourceOverview(owner.user().id(), token, source, 0, "Saved source overview");

        assertThat(overviewResultService.readCurrentSource(owner.user().id(), source.getId(),
                source.getIngestionRevision())).isPresent();
        assertThat(overviewResultService.currentSourceOverviewIds(owner.user().id(),
                java.util.Map.of(source.getId(), source.getIngestionRevision()))).containsExactly(source.getId());
        assertThat(overviewResultService.currentSourceOverviewIds(UUID.randomUUID(),
                java.util.Map.of(source.getId(), source.getIngestionRevision()))).isEmpty();

        UUID nextRevision = UUID.randomUUID();
        jdbcTemplate.update("update sources set ingestion_revision = ? where id = ?", nextRevision, source.getId());
        assertThatThrownBy(() -> overviewResultService.readCurrentSource(owner.user().id(), source.getId(),
                source.getIngestionRevision())).hasMessageContaining("Source changed during this Chat run");
        assertThat(overviewResultService.currentSourceOverviewIds(owner.user().id(),
                java.util.Map.of(source.getId(), source.getIngestionRevision()))).isEmpty();
    }

    @Test
    void subjectResultsValidateNumericPartManifestAndInvalidateOnSourceOverviewChangeAndDelete() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Subject manifest", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Manifest source", SourceType.FILE);
        createReadySource(owner.user().id(), subjectId, "Manifest text", SourceType.TEXT);
        createReadySource(owner.user().id(), subjectId, "Manifest URL", SourceType.URL);
        putSourceOverview(owner.user().id(), token, source, 0, "Source one");

        var manifest = List.of(new OverviewSourceManifestEntry(source.getId(), source.getIngestionRevision(), 1L, 1L));
        var subjectSeed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                manifest, fingerprint(source.getId(), source.getIngestionRevision(), 1, 1), null, null,
                fullResult("Subject output"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(subjectSeed)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outlineVersion").value(1))
                .andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.outlineSourceManifest.length()").value(1))
                .andExpect(jsonPath("$.summarySourceManifest.length()").value(1));
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());

        jdbcTemplate.update("update sources set title = 'Renamed source' where id = ?", source.getId());
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());

        var sourceOutlineUpdate = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.OUTLINE,
                source.getIngestionRevision(), null, null, null, null, outlineOnlyResult("Source two"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sourceOutlineUpdate)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outlineVersion").value(2))
                .andExpect(jsonPath("$.summaryVersion").value(1));
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());

        var stale = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.ALL, null,
                manifest, fingerprint(source.getId(), source.getIngestionRevision(), 1, 1), null, null,
                fullResult("Stale subject"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(stale)))
                .andExpect(status().isConflict());

        var currentManifest = List.of(new OverviewSourceManifestEntry(source.getId(), source.getIngestionRevision(), 2L, 1L));
        var reseed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                currentManifest, fingerprint(source.getId(), source.getIngestionRevision(), 2, 1), null, null,
                fullResult("Refreshed subject"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reseed)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));

        UUID movedSubjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Moved source subject", null, null, "002")).id();
        jdbcTemplate.update("update sources set subject_id = ?, ingestion_status = 'READY' where id = ?",
                movedSubjectId, source.getId());
        var movedManifest = List.of(new OverviewSourceManifestEntry(source.getId(), source.getIngestionRevision(), 2L, 1L));
        var movedSubjectSeed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                movedManifest, fingerprint(source.getId(), source.getIngestionRevision(), 2, 1), null, null,
                fullResult("Moved subject output"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", movedSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(movedSubjectSeed)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/overview-results/subjects/{id}", movedSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .param("ingestionRevision", source.getIngestionRevision().toString())
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());

        subjectService.delete(owner.user().id(), subjectId, 0);
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/overview-results/subjects/{id}", movedSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .param("ingestionRevision", source.getIngestionRevision().toString())
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());

        sourceService.delete(owner.user().id(), source.getId(), 0);
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/overview-results/subjects/{id}", movedSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());
    }

    @Test
    void subjectStatusesBatchReturnsOnlyCurrentMetadataAndHidesUnavailableScopes() throws Exception {
        var owner = owner();
        var otherOwner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID availableSubjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Available batch status", null, null, "001")).id();
        UUID staleSubjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Stale batch status", null, null, "002")).id();
        UUID missingSubjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Missing batch status", null, null, "003")).id();
        UUID deletedSubjectId = subjectService.create(owner.user().id(),
                new SubjectCommand("Deleted batch status", null, null, "004")).id();
        UUID foreignSubjectId = subjectService.create(otherOwner.user().id(),
                new SubjectCommand("Foreign batch status", null, null, "001")).id();
        UUID randomSubjectId = UUID.randomUUID();

        SourceEntity availableSource = createReadySource(owner.user().id(), availableSubjectId,
                "Available batch source", SourceType.FILE);
        putSourceOverview(owner.user().id(), token, availableSource, 0, "Available source");
        var availableManifest = List.of(new OverviewSourceManifestEntry(availableSource.getId(),
                availableSource.getIngestionRevision(), 1L, 1L));
        var availableSeed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                availableManifest, fingerprint(availableSource.getId(), availableSource.getIngestionRevision(), 1, 1),
                null, null, fullResult("Available subject"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", availableSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(availableSeed)))
                .andExpect(status().isOk());

        SourceEntity staleSource = createReadySource(owner.user().id(), staleSubjectId,
                "Stale batch source", SourceType.FILE);
        putSourceOverview(owner.user().id(), token, staleSource, 0, "Stale source");
        var staleManifest = List.of(new OverviewSourceManifestEntry(staleSource.getId(),
                staleSource.getIngestionRevision(), 1L, 1L));
        var staleSeed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                staleManifest, fingerprint(staleSource.getId(), staleSource.getIngestionRevision(), 1, 1),
                null, null, fullResult("Stale subject"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", staleSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(staleSeed)))
                .andExpect(status().isOk());
        var staleSourceUpdate = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.OUTLINE,
                staleSource.getIngestionRevision(), null, null, null, null,
                outlineOnlyResult("Changed source"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", staleSource.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(staleSourceUpdate)))
                .andExpect(status().isOk());
        OverviewInputDescriptor deletedRawInput = new OverviewInputDescriptor(
                OverviewInputDescriptor.Origin.SOURCE_CONTENT, "SUBJECT", staleSubjectId, List.of(staleSource.getId()),
                List.of(), List.of(), List.of(), "stale-raw-input-fingerprint");
        jdbcTemplate.update("update overview_results set outline_input_origin='SOURCE_CONTENT', outline_input_snapshot_json=? "
                        + "where user_id=? and scope_type='SUBJECT' and scope_id=?",
                objectMapper.writeValueAsString(deletedRawInput), owner.user().id(), staleSubjectId);
        jdbcTemplate.update("update sources set deleted_at=? where id=?", Instant.now(), staleSource.getId());
        subjectService.delete(owner.user().id(), deletedSubjectId, 0);

        JsonNode existingGet = objectMapper.readTree(mockMvc.perform(get(
                                "/api/overview-results/subjects/{id}", availableSubjectId)
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        int resultCountBefore = jdbcTemplate.queryForObject("select count(*) from overview_results where user_id=?",
                Integer.class, owner.user().id());
        int receiptCountBefore = jdbcTemplate.queryForObject("select count(*) from overview_write_receipts where user_id=?",
                Integer.class, owner.user().id());
        String request = objectMapper.writeValueAsString(java.util.Map.of("subjectIds", List.of(
                availableSubjectId, missingSubjectId, availableSubjectId, staleSubjectId, deletedSubjectId,
                foreignSubjectId, randomSubjectId)));
        JsonNode response = objectMapper.readTree(mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(response.path("items").size()).isEqualTo(6);
        assertThat(response.at("/items/0/subjectId").asString()).isEqualTo(availableSubjectId.toString());
        assertThat(response.at("/items/0/status").asString()).isEqualTo("AVAILABLE");
        assertThat(response.at("/items/0/version").longValue()).isEqualTo(existingGet.path("version").longValue());
        assertThat(response.at("/items/0/outlineVersion").longValue()).isEqualTo(existingGet.path("outlineVersion").longValue());
        assertThat(response.at("/items/0/summaryVersion").longValue()).isEqualTo(existingGet.path("summaryVersion").longValue());
        assertThat(response.at("/items/0/updatedAt").asString()).isEqualTo(existingGet.path("updatedAt").asString());
        assertThat(response.at("/items/0/title").isMissingNode()).isTrue();
        assertThat(response.at("/items/0/outline").isMissingNode()).isTrue();
        assertThat(response.at("/items/0/summary").isMissingNode()).isTrue();
        assertThat(response.at("/items/1/status").asString()).isEqualTo("MISSING");
        assertThat(response.at("/items/2/subjectId").asString()).isEqualTo(staleSubjectId.toString());
        assertThat(response.at("/items/2/status").asString()).isEqualTo("MISSING");
        assertThat(response.at("/items/2/version").isNull()).isTrue();
        assertThat(response.at("/items/2/outlineVersion").isNull()).isTrue();
        assertThat(response.at("/items/2/summaryVersion").isNull()).isTrue();
        assertThat(response.at("/items/2/updatedAt").isNull()).isTrue();
        for (int index = 1; index < 6; index++) {
            if (index == 2) continue;
            assertThat(response.at("/items/" + index + "/version").isNull()).isTrue();
            assertThat(response.at("/items/" + index + "/outlineVersion").isNull()).isTrue();
            assertThat(response.at("/items/" + index + "/summaryVersion").isNull()).isTrue();
            assertThat(response.at("/items/" + index + "/updatedAt").isNull()).isTrue();
        }
        assertThat(response.at("/items/3/status").asString()).isEqualTo("UNAVAILABLE");
        assertThat(response.at("/items/4/status").asString()).isEqualTo("UNAVAILABLE");
        assertThat(response.at("/items/5/status").asString()).isEqualTo("UNAVAILABLE");
        assertThat(jdbcTemplate.queryForObject("select count(*) from overview_results where user_id=?",
                Integer.class, owner.user().id())).isEqualTo(resultCountBefore);
        assertThat(jdbcTemplate.queryForObject("select count(*) from overview_write_receipts where user_id=?",
                Integer.class, owner.user().id())).isEqualTo(receiptCountBefore);
    }

    @Test
    void subjectStatusesRequireAuthenticationAndValidateRawRequestBeforeDeduplication() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID repeated = UUID.randomUUID();

        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("subjectIds", List.of(repeated)))))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectIds\":[]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectIds\":null}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content("null"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectIds\":[null]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectIds\":[\"not-a-uuid\"]}"))
                .andExpect(status().isBadRequest());
        String oversizedDuplicates = objectMapper.writeValueAsString(java.util.Map.of("subjectIds",
                java.util.Collections.nCopies(101, repeated)));
        mockMvc.perform(post("/api/overview-results/subjects/statuses")
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(oversizedDuplicates))
                .andExpect(status().isBadRequest());
    }

    private com.auralis.app.identity.AuthResult owner() {
        return identityService.register("overview-" + UUID.randomUUID(), "phase-three-password", "Overview",
                new DeviceCommand("overview-device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB));
    }

    private SourceEntity createReadySource(UUID userId, UUID subjectId, String title) {
        return createReadySource(userId, subjectId, title, SourceType.TEXT);
    }

    private SourceEntity createReadySource(UUID userId, UUID subjectId, String title, SourceType type) {
        return sourceRepository.saveAndFlush(new SourceEntity(UUID.randomUUID(), userId, type,
                subjectId, title, null, type == SourceType.URL ? "https://example.com/manifest" : null,
                type == SourceType.TEXT ? "Source text" : null, null, SourceIngestionStatus.READY));
    }

    private JsonNode putSourceOverview(UUID userId, String token, SourceEntity source, long baseVersion,
                                       String title) throws Exception {
        var command = new OverviewResultCommand(baseVersion, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, fullResult(title));
        var result = mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private OverviewDtos.OverviewResponse fullResult(String title) {
        return new OverviewDtos.OverviewResponse(2, title,
                outlineOnlyResult(title).outlineMarkdown(), "Summary " + title);
    }

    private OverviewDtos.OverviewResponse outlineOnlyResult(String title) {
        return new OverviewDtos.OverviewResponse(2, title, "## Chapter " + title + "\n\n### Section\n\nSection summary", null);
    }

    private OverviewDtos.OverviewResponse summaryOnlyResult(String title) {
        return new OverviewDtos.OverviewResponse(2, title, null, title);
    }

    private String fingerprint(UUID sourceId, UUID revision, long outlineVersion, long summaryVersion) throws Exception {
        String canonical = "AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1\n"
                + sourceId.toString().toLowerCase() + "\t" + revision.toString().toLowerCase() + "\t"
                + outlineVersion + "\t" + summaryVersion + "\n";
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(canonical.getBytes(StandardCharsets.UTF_8)));
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
