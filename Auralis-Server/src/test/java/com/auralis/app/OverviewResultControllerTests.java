package com.auralis.app;

import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewResultCommand;
import com.auralis.app.ai.OverviewSourceManifestEntry;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
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
    void sourcePutAcceptsCandidateInputWireAndRejectsMissingOwnerJobWithoutWritingResultOrReceipt() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Candidate input subject", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Candidate source");
        UUID clientWriteId = UUID.randomUUID();
        var command = new OverviewResultCommand(0L, clientWriteId, OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null,
                fullResult(source.getId(), "Candidate output"), newIdentity(fullResult(source.getId(), "Candidate output")),
                null, null, new OverviewResultCommand.CandidateInput(UUID.randomUUID(), 3));

        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isNotFound());

        var conflicting = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, "client-input-must-not-be-trusted", null, null,
                fullResult(source.getId(), "Candidate output"), null, null, null,
                new OverviewResultCommand.CandidateInput(UUID.randomUUID(), 3));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(conflicting)))
                .andExpect(status().isBadRequest());

        assertThat(jdbcTemplate.queryForObject("select count(*) from overview_results where user_id=? and scope_type='SOURCE' and scope_id=?",
                Integer.class, owner.user().id(), source.getId())).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                Integer.class, owner.user().id(), clientWriteId)).isZero();
    }

    @Test
    void revokedWriteReceiptCannotReplayItsOldSnapshot() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Revoked receipt subject", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Revoked receipt source");
        var command = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null,
                fullResult(source.getId(), "Receipt snapshot content"), newIdentity(fullResult(source.getId(), "Receipt snapshot content")), null);
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
        var result = fullResult(source.getId(), longTitle);
        var command = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, result, newIdentity(result), null);

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
                fullResult(source.getId(), "Original"), newIdentity(fullResult(source.getId(), "Original")), null);
        String firstBody = objectMapper.writeValueAsString(firstCommand);

        var first = mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.outlineVersion").value(1)).andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.schemaVersion").value(1)).andExpect(jsonPath("$.title").value("Original"))
                .andReturn();
        JsonNode firstJson = objectMapper.readTree(first.getResponse().getContentAsString());
        String persistedId = firstJson.path("id").asString();
        assertThat(firstJson.at("/outlineInputDescriptor/origin").asString()).isEqualTo("SOURCE_REVISION");
        assertThat(firstJson.at("/summaryInputDescriptor/origin").asString()).isEqualTo("SOURCE_REVISION");
        OutlineIdentityInput existingIdentity = identityFrom(firstJson.path("outlineIdentity"));
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content(firstBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identityReady").value(true));
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

        OverviewResultCommand oldShapeReplay = new OverviewResultCommand(0L, firstCommand.clientWriteId(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, cachedOutlineAt, cachedSummaryAt,
                fullResult(source.getId(), "Original"));
        String legacyPayloadHash = legacyPayloadHash(source.getId(), oldShapeReplay);
        JsonNode oldSnapshot = objectMapper.readTree(first.getResponse().getContentAsString());
        var oldReceiptView = (tools.jackson.databind.node.ObjectNode) oldSnapshot;
        oldReceiptView.remove("identityReady");
        oldReceiptView.remove("outlineIdentity");
        oldReceiptView.remove("outlineProvenance");
        jdbcTemplate.update("update overview_write_receipts set payload_hash = ?, response_snapshot = ? where client_write_id = ?",
                legacyPayloadHash, objectMapper.writeValueAsString(oldSnapshot), firstCommand.clientWriteId());
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(oldShapeReplay)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.identityReady").value(false))
                .andExpect(result -> {
                    JsonNode replayedBody = objectMapper.readTree(result.getResponse().getContentAsString());
                    assertThat(replayedBody.has("outlineIdentity")).isTrue();
                    assertThat(replayedBody.path("outlineIdentity").isNull()).isTrue();
                })
                .andExpect(jsonPath("$.outlineProvenance").doesNotExist());

        Instant nextOutlineAt = Instant.parse("2026-09-02T10:00:00Z");
        var partial = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.OUTLINE,
                source.getIngestionRevision(), null, null, nextOutlineAt, null,
                outlineOnlyResult(source.getId(), "Updated outline"), existingIdentity, null);
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.outlineVersion").value(2)).andExpect(jsonPath("$.summaryVersion").value(1))
                .andExpect(jsonPath("$.summary.overview").value("Summary Original"))
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
                .andExpect(jsonPath("$.identityReady").value(true))
                .andExpect(jsonPath("$.outlineIdentity.nodes[0].nodeId")
                        .value(firstJson.at("/outlineIdentity/nodes/0/nodeId").asString()));

        JsonNode outline = objectMapper.readTree(mockMvc.perform(get("/api/overview-results/sources/{id}/outline", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3))
                .andReturn().getResponse().getContentAsString());
        assertThat(outline.at("/nodes/1").has("summary")).isFalse();
        assertThat(outline.toString()).doesNotContain("Section summary");
        String sectionId = outline.at("/nodes/1/sectionId").asString();
        mockMvc.perform(get("/api/overview-results/sources/{id}/sections/{sectionId}", source.getId(), sectionId)
                        .param("version", "3").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3))
                .andExpect(jsonPath("$.section.title").value("Section"))
                .andExpect(jsonPath("$.section.summary").value("Section summary"));
        mockMvc.perform(get("/api/overview-results/sources/{id}/sections/{sectionId}", source.getId(), sectionId)
                        .param("version", "2").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isConflict());
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
                nextRevision, null, null, null, null, fullResult(source.getId(), "New revision"),
                newIdentity(fullResult(source.getId(), "New revision")), null);
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reseed)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(4))
                .andExpect(jsonPath("$.outlineVersion").value(3)).andExpect(jsonPath("$.summaryVersion").value(3));
    }

    @Test
    void subjectResultsValidateNumericPartManifestAndInvalidateOnSourceOverviewChangeAndDelete() throws Exception {
        var owner = owner();
        String token = bearer(owner.tokens().accessToken());
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand("Subject manifest", null, null, "001")).id();
        SourceEntity source = createReadySource(owner.user().id(), subjectId, "Manifest source", SourceType.FILE);
        createReadySource(owner.user().id(), subjectId, "Manifest text", SourceType.TEXT);
        createReadySource(owner.user().id(), subjectId, "Manifest URL", SourceType.URL);
        JsonNode initialSourceOverview = putSourceOverview(owner.user().id(), token, source, 0, "Source one");

        var manifest = List.of(new OverviewSourceManifestEntry(source.getId(), source.getIngestionRevision(), 1L, 1L));
        var subjectSeed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                manifest, fingerprint(source.getId(), source.getIngestionRevision(), 1, 1), null, null,
                fullResult(source.getId(), "Subject output"), newIdentity(fullResult(source.getId(), "Subject output")), null);
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
                source.getIngestionRevision(), null, null, null, null, outlineOnlyResult(source.getId(), "Source two"),
                identityFrom(initialSourceOverview.path("outlineIdentity")), null);
        mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sourceOutlineUpdate)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outlineVersion").value(2))
                .andExpect(jsonPath("$.summaryVersion").value(1));
        mockMvc.perform(get("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isNotFound());

        var stale = new OverviewResultCommand(1L, UUID.randomUUID(), OverviewMode.ALL, null,
                manifest, fingerprint(source.getId(), source.getIngestionRevision(), 1, 1), null, null,
                fullResult(source.getId(), "Stale subject"), newIdentity(fullResult(source.getId(), "Stale subject")), null);
        mockMvc.perform(put("/api/overview-results/subjects/{id}", subjectId)
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(stale)))
                .andExpect(status().isConflict());

        var currentManifest = List.of(new OverviewSourceManifestEntry(source.getId(), source.getIngestionRevision(), 2L, 1L));
        var reseed = new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL, null,
                currentManifest, fingerprint(source.getId(), source.getIngestionRevision(), 2, 1), null, null,
                fullResult(source.getId(), "Refreshed subject"), newIdentity(fullResult(source.getId(), "Refreshed subject")), null);
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
                fullResult(source.getId(), "Moved subject output"), newIdentity(fullResult(source.getId(), "Moved subject output")), null);
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

    private JsonNode putSourceOverview(UUID userId, String token, SourceEntity source, long baseVersion,
                                       String title) throws Exception {
        var command = new OverviewResultCommand(baseVersion, UUID.randomUUID(), OverviewMode.ALL,
                source.getIngestionRevision(), null, null, null, null, fullResult(source.getId(), title),
                newIdentity(fullResult(source.getId(), title)), null);
        var result = mockMvc.perform(put("/api/overview-results/sources/{id}", source.getId())
                        .header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private OutlineIdentityInput newIdentity(OverviewDtos.OverviewResponse result) {
        var nodes = new java.util.ArrayList<OutlineIdentityNodeInput>();
        for (int chapter = 0; chapter < result.outline().size(); chapter++) {
            nodes.add(new OutlineIdentityNodeInput(List.of(chapter), null));
            for (int section = 0; section < result.outline().get(chapter).sections().size(); section++) {
                nodes.add(new OutlineIdentityNodeInput(List.of(chapter, section), null));
            }
        }
        return new OutlineIdentityInput(1, nodes);
    }

    private OutlineIdentityInput identityFrom(JsonNode value) {
        var nodes = new java.util.ArrayList<OutlineIdentityNodeInput>();
        for (JsonNode node : value.path("nodes")) {
            var path = new java.util.ArrayList<Integer>();
            node.path("path").forEach(segment -> path.add(segment.asInt()));
            nodes.add(new OutlineIdentityNodeInput(path, UUID.fromString(node.path("nodeId").asString())));
        }
        return new OutlineIdentityInput(value.path("schemaVersion").asInt(), nodes);
    }

    private String legacyPayloadHash(UUID sourceId, OverviewResultCommand command) throws Exception {
        LegacyReceiptPayload payload = new LegacyReceiptPayload("SOURCE", sourceId, command.baseVersion(),
                command.clientWriteId(), command.mode(), command.ingestionRevision(), List.of(),
                command.inputFingerprint(), command.outlineGeneratedAt(), command.summaryGeneratedAt(),
                new OverviewDtos.OverviewResponse(command.result().schemaVersion(), command.result().title(),
                        command.result().outline(), command.result().summary()));
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                objectMapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8)));
    }

    private record LegacyReceiptPayload(String scopeType, UUID scopeId, long baseVersion, UUID clientWriteId,
                                        OverviewMode mode, UUID ingestionRevision,
                                        List<OverviewSourceManifestEntry> sourceManifest,
                                        String inputFingerprint, Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                                        OverviewDtos.OverviewResponse result) {
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

    private OverviewDtos.OverviewResponse summaryOnlyResult(String title) {
        return new OverviewDtos.OverviewResponse(1, title, null,
                new OverviewDtos.OverviewSummary(title, List.of("Point"), List.of("Step")));
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
