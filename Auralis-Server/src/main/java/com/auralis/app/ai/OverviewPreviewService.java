package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewIdentityDtos.CanonicalSourceRefView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSectionInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSourceRefInput;
import com.auralis.app.shared.error.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class OverviewPreviewService {
    private final JdbcTemplate jdbc;
    private final OverviewJobRepository jobs;
    private final OverviewPublicationRepository publicationRepository;
    private final OverviewGenerationService generationService;
    private final OverviewIdentityService identityService;
    private final OverviewDocumentValidator documentValidator;
    private final ObjectMapper mapper;

    public OverviewPreviewService(JdbcTemplate jdbc, OverviewJobRepository jobs,
                                  OverviewPublicationRepository publicationRepository,
                                  OverviewGenerationService generationService,
                                  OverviewIdentityService identityService,
                                  OverviewDocumentValidator documentValidator, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.publicationRepository = publicationRepository;
        this.generationService = generationService;
        this.identityService = identityService;
        this.documentValidator = documentValidator;
        this.mapper = mapper;
    }

    @Transactional
    public OverviewPreviewDtos.Page page(UUID userId, UUID jobId, int limit, String cursor) {
        if (limit < 1 || limit > 50) throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 50");
        OverviewJobRepository.JobRow job = currentJob(userId, jobId);
        Plan plan = activePlan(job);
        if (plan == null) return new OverviewPreviewDtos.Page(jobId, job.status(), null, null,
                job.status() != OverviewJobDtos.Status.COMPLETED, List.of(), null);
        int afterOrdinal = decodeCursor(cursor, userId, jobId, plan.id());
        List<NodeRow> rows = jdbc.query("select id,node_ordinal,state,descriptor_json,descriptor_sha256,checkpoint_step,checkpoint_sha256 "
                        + "from overview_execution_nodes where plan_id=? and state='VERIFIED' and node_ordinal>? order by node_ordinal limit ?",
                (rs, row) -> new NodeRow(rs.getObject("id", UUID.class), rs.getInt("node_ordinal"), rs.getString("state"),
                        rs.getString("descriptor_json"), rs.getString("descriptor_sha256").trim(), rs.getString("checkpoint_step"),
                        rs.getString("checkpoint_sha256") == null ? null : rs.getString("checkpoint_sha256").trim()),
                plan.id(), afterOrdinal, limit + 1);
        boolean more = rows.size() > limit;
        List<NodeRow> page = more ? rows.subList(0, limit) : rows;
        List<OverviewPreviewDtos.Node> result = page.stream().map(row -> previewNode(job, plan, row)).toList();
        String next = more && !page.isEmpty() ? encodeCursor(userId, jobId, plan.id(), page.getLast().ordinal()) : null;
        return new OverviewPreviewDtos.Page(jobId, job.status(), plan.id(), plan.fingerprint(),
                job.status() != OverviewJobDtos.Status.COMPLETED, result, next);
    }

    @Transactional
    public OverviewPreviewDtos.NodeView node(UUID userId, UUID jobId, UUID nodeId, UUID planId) {
        OverviewJobRepository.JobRow job = currentJob(userId, jobId);
        Plan plan = activePlan(job);
        if (plan == null || planId == null || !plan.id().equals(planId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Preview plan is no longer active");
        }
        NodeRow row = jdbc.query("select id,node_ordinal,state,descriptor_json,descriptor_sha256,checkpoint_step,checkpoint_sha256 "
                        + "from overview_execution_nodes where id=? and plan_id=? and state='VERIFIED'",
                rs -> rs.next() ? new NodeRow(rs.getObject("id", UUID.class), rs.getInt("node_ordinal"), rs.getString("state"),
                        rs.getString("descriptor_json"), rs.getString("descriptor_sha256").trim(), rs.getString("checkpoint_step"),
                        rs.getString("checkpoint_sha256") == null ? null : rs.getString("checkpoint_sha256").trim()) : null,
                nodeId, plan.id());
        if (row == null) throw new DomainException("RESOURCE_NOT_FOUND", "Verified preview node was not found");
        NodeDescriptor descriptor = descriptor(row);
        String checkpoint = checkpoint(job, row);
        OverviewResponse written = read(checkpoint, OverviewResponse.class);
        List<List<UnitRef>> fragmentUnits = writerFragmentProof(job, row, written, descriptor);
        if (written.outline() == null || written.outline().size() != 1 || written.outline().getFirst().sections().isEmpty()
                || written.summary() != null) throw corrupt("writer checkpoint shape");
        Map<String, UnitRef> aliases = new HashMap<>();
        descriptor.units().forEach(unit -> aliases.put(unit.alias(), unit));
        LinkedHashSet<String> expectedAliases = new LinkedHashSet<>(aliases.keySet());
        Map<UUID, UUID> revisions = new HashMap<>();
        descriptor.units().forEach(unit -> revisions.put(unit.sourceId(), unit.sourceRevision()));
        List<OverviewPreviewDtos.Fragment> fragments = new ArrayList<>();
        Set<String> coveredAliases = new LinkedHashSet<>();
        List<OverviewSection> sections = written.outline().getFirst().sections();
        for (int index = 0; index < sections.size(); index++) {
            OverviewSection section = sections.get(index);
            Set<String> fragmentAliases = fragmentUnits.get(index).stream().map(UnitRef::alias)
                    .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
            if (section.sourceIds() == null || section.sourceIds().size() != fragmentAliases.size()
                    || !new LinkedHashSet<>(section.sourceIds()).equals(fragmentAliases)) throw corrupt("writer fragment source coverage");
            coveredAliases.addAll(section.sourceIds());
            List<UnitRef> refsForFragment = fragmentUnits.get(index);
            List<OutlineProvenanceSourceRefInput> refs = refsForFragment.stream()
                    .map(unit -> new OutlineProvenanceSourceRefInput(unit.sourceId(), unit.sourceRevision(), unit.chunkId(),
                            unit.generation(), unit.charStart(), unit.charEnd())).toList();
            List<String> sourceIds = refsForFragment.stream().map(unit -> unit.sourceId().toString()).distinct().toList();
            OverviewSection mappedSection = new OverviewSection(section.title(), section.summary(), sourceIds, section.locator());
            OverviewResponse mapped = new OverviewResponse(written.schemaVersion(), written.title(),
                    List.of(new OverviewChapter(descriptor.chapterTitle(), List.of(mappedSection))), null);
            Map<String, String> authorized = new HashMap<>();
            refsForFragment.forEach(unit -> authorized.put(unit.sourceId().toString(), unit.sourceId().toString()));
            mapped = documentValidator.validateProviderDocument(write(mapped), authorized);
            OutlineProvenanceInput provenance = new OutlineProvenanceInput(1,
                    List.of(new OutlineProvenanceSectionInput(List.of(0, 0), refs)));
            OutlineIdentityInput identity = new OutlineIdentityInput(OverviewIdentityService.SCHEMA_VERSION,
                    List.of(new OutlineIdentityNodeInput(List.of(0), null),
                            new OutlineIdentityNodeInput(List.of(0, 0), null)));
            List<CanonicalSourceRefView> canonical = identityService.bind(userId, mapped, identity, provenance,
                    Map.copyOf(revisions), null).outlineProvenance().sections().getFirst().sourceRefs();
            fragments.add(new OverviewPreviewDtos.Fragment(mapped.outline().getFirst().sections().getFirst(), canonical));
        }
        if (!coveredAliases.containsAll(expectedAliases)) throw corrupt("writer aggregate source coverage");
        return new OverviewPreviewDtos.NodeView(jobId, plan.id(), nodeId, row.ordinal(), descriptor.chapterIndex(),
                descriptor.chapterTitle(), List.copyOf(fragments));
    }

    private OverviewPreviewDtos.Node previewNode(OverviewJobRepository.JobRow job, Plan plan, NodeRow row) {
        NodeDescriptor descriptor = descriptor(row);
        checkpoint(job, row);
        return new OverviewPreviewDtos.Node(row.id(), row.ordinal(), descriptor.chapterIndex(), descriptor.chapterTitle(),
                descriptor.sectionTitle(), descriptor.sectionSummary(), descriptor.units().stream().map(unit ->
                new OverviewPreviewDtos.InputRef(unit.sourceId(), unit.sourceRevision(), unit.chunkId(), unit.generation(),
                        unit.ordinal(), unit.contentHash(), unit.charStart(), unit.charEnd())).toList());
    }

    private OverviewJobRepository.JobRow currentJob(UUID userId, UUID jobId) {
        OverviewJobRepository.JobRow job = jobs.get(userId, jobId);
        if (job.status() == OverviewJobDtos.Status.CANCELLED || job.status() == OverviewJobDtos.Status.EXPIRED
                || job.generationId() == null) throw new DomainException("RESOURCE_VERSION_CONFLICT", "This Overview job cannot expose a preview");
        OverviewJobDtos.StartRequest request = readRequest(job.requestJson());
        List<UUID> ids = request.scope() == OverviewJobDtos.Scope.SOURCE ? List.of(request.sourceId()) : request.sourceIds();
        publicationRepository.lockScopeForRead(userId, job.scopeType(), job.scopeId(), ids);
        OverviewJobRepository.JobRow locked = jobs.get(userId, jobId);
        if (locked.version() != job.version() || !locked.requestHash().equals(job.requestHash())
                || !locked.sourceManifestJson().equals(job.sourceManifestJson())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview job changed while preview access was being validated");
        }
        job = locked;
        OverviewInputDescriptor current = generationService.currentRawInputDescriptor(userId, request.scope(), job.scopeId(), ids);
        List<OverviewInputDescriptor.OverviewPartInputUnit> saved = read(job.sourceManifestJson(), new TypeReference<>() { });
        if (!saved.equals(current.rawUnits())) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Raw inputs changed after this job started");
        return job;
    }

    private Plan activePlan(OverviewJobRepository.JobRow job) {
        Plan plan = jdbc.query("select id,plan_fingerprint,input_fingerprint,profile_fingerprint,algorithm_version,state,payload_json "
                        + "from overview_execution_plans where generation_id=? and state<>'SUPERSEDED' order by created_at desc,id desc limit 1",
                rs -> rs.next() ? new Plan(rs.getObject("id", UUID.class), rs.getString("plan_fingerprint").trim(),
                        rs.getString("input_fingerprint").trim(), rs.getString("profile_fingerprint").trim(),
                        rs.getString("algorithm_version"), rs.getString("state"), rs.getString("payload_json")) : null, job.generationId());
        if (plan != null && (!plan.inputFingerprint().equals(job.inputFingerprint())
                || !plan.profileFingerprint().equals(job.profileFingerprint())
                || !plan.algorithmVersion().equals(job.algorithmVersion())
                || plan.payload() == null || !sha256(plan.payload()).equals(plan.fingerprint()))) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Active preview plan identity changed");
        }
        return plan;
    }

    private String checkpoint(OverviewJobRepository.JobRow job, NodeRow node) {
        NodeDescriptor descriptor = descriptor(node);
        Checkpoint checkpoint = jdbc.query("select payload_json,payload_sha256 from overview_generation_checkpoints where generation_id=? and step_key=? "
                        + "and input_fingerprint=? and profile_fingerprint=? and algorithm_version=?",
                rs -> rs.next() ? new Checkpoint(rs.getString("payload_json"), rs.getString("payload_sha256").trim()) : null,
                job.generationId(), node.checkpointStep(), job.inputFingerprint(), job.profileFingerprint(), job.algorithmVersion());
        if (checkpoint == null || node.checkpointHash() == null || !node.checkpointHash().equals(checkpoint.hash())
                || !sha256(checkpoint.payload()).equals(checkpoint.hash())) throw corrupt("verified checkpoint hash");
        if (descriptor.units() == null || descriptor.units().isEmpty()) throw corrupt("verified unit descriptor");
        return checkpoint.payload();
    }

    private List<List<UnitRef>> writerFragmentProof(OverviewJobRepository.JobRow job, NodeRow node,
                                                   OverviewResponse payload, NodeDescriptor descriptor) {
        String resultStep = "step_" + sha256("OVERVIEW_ADAPTIVE_WRITER_RESULT_V1|" + node.checkpointStep());
        String resultJson = jdbc.query("select payload_json from overview_generation_checkpoints where generation_id=? and step_key=? "
                        + "and input_fingerprint=? and profile_fingerprint=? and algorithm_version=?",
                rs -> rs.next() ? rs.getString("payload_json") : null, job.generationId(), resultStep,
                job.inputFingerprint(), job.profileFingerprint(), job.algorithmVersion());
        if (resultJson == null) throw corrupt("writer result proof");
        try {
            var manifest = mapper.readTree(resultJson);
            if (!"OVERVIEW_ADAPTIVE_WRITER_RESULT".equals(manifest.path("kind").asText())
                    || manifest.path("version").asInt() != 1
                    || !node.checkpointStep().equals(manifest.path("parentStep").asText())
                    || !descriptor.promptSha256().equals(manifest.path("parentPromptSha256").asText())) {
                throw corrupt("writer result identity");
            }
            String payloadStep = manifest.path("parentPayloadStep").asText();
            String storedPayload = jdbc.query("select payload_json from overview_generation_checkpoints where generation_id=? and step_key=? "
                            + "and input_fingerprint=? and profile_fingerprint=? and algorithm_version=?",
                    rs -> rs.next() ? rs.getString("payload_json") : null, job.generationId(), payloadStep,
                    job.inputFingerprint(), job.profileFingerprint(), job.algorithmVersion());
            if (storedPayload == null || !sha256(storedPayload).equals(manifest.path("parentPayloadSha256").asText())
                    || !write(payload).equals(storedPayload)) throw corrupt("writer result payload binding");
            var fragments = manifest.path("fragments");
            if (!fragments.isArray() || fragments.size() != payload.outline().getFirst().sections().size()) {
                throw corrupt("writer fragment proof count");
            }
            Map<String, UnitRef> expected = new HashMap<>();
            descriptor.units().forEach(unit -> expected.put(unit.alias(), unit));
            List<List<UnitRef>> result = new ArrayList<>();
            Set<String> covered = new LinkedHashSet<>();
            for (int index = 0; index < fragments.size(); index++) {
                var fragment = fragments.get(index);
                OverviewSection section = payload.outline().getFirst().sections().get(index);
                if (fragment.path("path").isMissingNode() || fragment.path("path").asText().isBlank()
                        || fragment.path("fragmentOrdinal").asInt(-1) != index
                        || !section.title().equals(fragment.path("sectionTitle").asText())
                        || !sha256(section.summary()).equals(fragment.path("bodySha256").asText())) {
                    throw corrupt("writer fragment body proof");
                }
                var units = fragment.path("units");
                if (!units.isArray() || units.size() == 0) throw corrupt("writer fragment ranges");
                List<UnitRef> fragmentRefs = new ArrayList<>();
                for (var range : units) {
                    String alias = range.path("alias").asText();
                    UnitRef ref = expected.get(alias);
                    if (ref == null || !ref.sourceId().equals(UUID.fromString(range.path("sourceId").asText()))
                            || !ref.sourceRevision().equals(UUID.fromString(range.path("sourceRevision").asText()))
                            || !ref.chunkId().equals(UUID.fromString(range.path("chunkId").asText()))
                            || !ref.generation().equals(UUID.fromString(range.path("generation").asText()))
                            || ref.ordinal() != range.path("ordinal").asInt()
                            || !ref.contentHash().equals(range.path("originContentHash").asText())
                            || ref.charStart() != range.path("charStart").asInt()
                            || ref.charEnd() != range.path("charEnd").asInt()) throw corrupt("writer source range binding");
                    fragmentRefs.add(ref);
                    covered.add(alias);
                }
                result.add(List.copyOf(fragmentRefs));
            }
            if (!covered.containsAll(expected.keySet())) throw corrupt("writer aggregate input coverage");
            return List.copyOf(result);
        } catch (DomainException failure) { throw failure; }
        catch (Exception invalid) { throw corrupt("writer result proof"); }
    }

    private NodeDescriptor descriptor(NodeRow row) {
        if (row.descriptorJson() == null || row.descriptorHash() == null || !sha256(row.descriptorJson()).equals(row.descriptorHash())) {
            throw corrupt("verified unit descriptor hash");
        }
        return read(row.descriptorJson(), NodeDescriptor.class);
    }

    private int decodeCursor(String cursor, UUID userId, UUID jobId, UUID planId) {
        if (cursor == null || cursor.isBlank()) return -1;
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", 4);
            if (parts.length != 4 || !parts[0].equals(userId.toString()) || !parts[1].equals(jobId.toString())
                    || !parts[2].equals(planId.toString())) throw new IllegalArgumentException("cursor domain");
            int ordinal = Integer.parseInt(parts[3]);
            if (ordinal < 0) throw new IllegalArgumentException("ordinal");
            return ordinal;
        } catch (RuntimeException invalid) { throw new DomainException("VALIDATION_FAILED", "Preview cursor is invalid"); }
    }

    private String encodeCursor(UUID userId, UUID jobId, UUID planId, int ordinal) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString((userId + "|" + jobId + "|" + planId + "|" + ordinal)
                .getBytes(StandardCharsets.UTF_8));
    }

    private OverviewJobDtos.StartRequest readRequest(String json) { return read(json, OverviewJobDtos.StartRequest.class); }
    private <T> T read(String json, Class<T> type) {
        try { return mapper.readValue(json, type); }
        catch (Exception invalid) { throw new DomainException("VALIDATION_FAILED", "Stored Overview preview data is invalid", null, invalid); }
    }
    private <T> T read(String json, TypeReference<T> type) {
        try { return mapper.readValue(json, type); }
        catch (Exception invalid) { throw new DomainException("VALIDATION_FAILED", "Stored Overview preview manifest is invalid", null, invalid); }
    }
    private String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception invalid) { throw new DomainException("INTERNAL_ERROR", "Overview preview data could not be encoded", null, invalid); }
    }
    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception unavailable) { throw new IllegalStateException("SHA-256 is unavailable", unavailable); }
    }
    private DomainException corrupt(String item) { return new DomainException("VALIDATION_FAILED", "Stored verified Overview " + item + " is invalid"); }

    private record Plan(UUID id, String fingerprint, String inputFingerprint, String profileFingerprint,
                        String algorithmVersion, String state, String payload) { }
    private record NodeRow(UUID id, int ordinal, String state, String descriptorJson, String descriptorHash,
                           String checkpointStep, String checkpointHash) { }
    private record Checkpoint(String payload, String hash) { }
    private record NodeDescriptor(int ordinal, String checkpointStep, String promptSha256, int chapterIndex,
                                  String chapterTitle, String sectionTitle, String sectionSummary, List<UnitRef> units) { }
    private record UnitRef(String alias, UUID sourceId, UUID sourceRevision, UUID chunkId, UUID generation,
                           int ordinal, String contentHash, int charStart, int charEnd) { }
}
