package com.auralis.app;

import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewResultCommand;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void sourceResultsFenceRevisionMergePartsAndPreserveCachedGenerationTimes() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Overview subject", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Original title");
        Instant cachedOutlineAt = Instant.parse("2026-09-01T10:00:00Z");
        Instant cachedSummaryAt = Instant.parse("2026-09-01T11:00:00Z");
        var firstCommand = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, cachedOutlineAt, cachedSummaryAt, fullResult(source.getId(), "Original"));
        String firstBody = objectMapper.writeValueAsString(firstCommand);

        var first = mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.outlineVersion").value(1)).andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.schemaVersion").value(1)).andExpect(jsonPath("$.title").value("Original"))
                .andReturn();
        JsonNode firstJson = objectMapper.readTree(first.getResponse().getContentAsString());
        String persistedId = firstJson.path("id").asString();
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
                outlineOnlyResult(source.getId(), "Updated outline"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.outlineVersion").value(2)).andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.summary.overview").value("Summary Original"))
                .andExpect(jsonPath("$.outlineGeneratedAt").value(nextOutlineAt.toString()))
                .andExpect(jsonPath("$.summaryGeneratedAt").value(cachedSummaryAt.toString()));

        UUID nextRevision = UUID.randomUUID();
        jdbcTemplate.update("update sources set ingestion_revision = ?, ingestion_status = 'READY' where id = ?",
                nextRevision, source.getId());
        mockMvc.perform(get("/api/overview-results/sources/{id}", source.getId())
                        .param("ingestionRevision", source.getIngestionRevision().toString())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        var reseed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                nextRevision, null, null, null, null, fullResult(source.getId(), "New revision"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reseed)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3))
                .andExpect(jsonPath("$.outlineVersion").value(3)).andExpect(jsonPath("$.summaryVersion").value(2));
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
                fullResult(source.getId(), "Subject output"));
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
                source.getIngestionRevision(), null, null, null, null, outlineOnlyResult(source.getId(), "Source two"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sourceOutlineUpdate)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outlineVersion").value(2))
                .andExpect(jsonPath("$.summaryVersion").value(1));
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());

        var stale = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.ALL, null,
                manifest, fingerprint(source.getId(), source.getIngestionRevision(), 1, 1), null, null,
                fullResult(source.getId(), "Stale subject"));
        mockMvc.perform(put("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(stale)))
                .andExpect(status().isConflict());

        var currentManifest = List.of(new OverviewSourceManifestEntry(source.getId(), source.getIngestionRevision(), 2L, 1L));
        var reseed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                currentManifest, fingerprint(source.getId(), source.getIngestionRevision(), 2, 1), null, null,
                fullResult(source.getId(), "Refreshed subject"));
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
                fullResult(source.getId(), "Moved subject output"));
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

    private void putSourceOverview(UUID userId, String token, SourceEntity source, long baseVersion,
                                   String title) throws Exception {
        var command = new OverviewResultCommand(baseVersion, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, fullResult(source.getId(), title));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isOk());
    }

    private OverviewDtos.OverviewResponse fullResult(UUID sourceId, String title) {
        return new OverviewDtos.OverviewResponse(1, title,
                List.of(new OverviewDtos.OverviewChapter("Chapter " + title,
                        List.of(new OverviewDtos.OverviewSection("Section", "Section summary",
                                List.of(sourceId.toString()), null)))),
                new OverviewDtos.OverviewSummary("Summary " + title, List.of("Point"), List.of("Step")));
    }

    private OverviewDtos.OverviewResponse outlineOnlyResult(UUID sourceId, String title) {
        return new OverviewDtos.OverviewResponse(1, title,
                List.of(new OverviewDtos.OverviewChapter("Chapter " + title,
                        List.of(new OverviewDtos.OverviewSection("Section", "Section summary",
                                List.of(sourceId.toString()), null)))), null);
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
