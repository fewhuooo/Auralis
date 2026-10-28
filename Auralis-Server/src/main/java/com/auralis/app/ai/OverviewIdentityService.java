package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewLocator;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewIdentityDtos.CanonicalSourceRefView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSectionInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSectionView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSourceRefInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceView;
import com.auralis.app.ai.OverviewIdentityDtos.ProvenanceLocationView;
import com.auralis.app.ai.OverviewIdentityDtos.ProvenancePrecision;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class OverviewIdentityService {

    public static final int SCHEMA_VERSION = 1;

    private final SourceChunkRepository chunkRepository;
    private final ObjectMapper objectMapper;
    private final AuralisProperties.OverviewLimits overviewLimits;

    public OverviewIdentityService(SourceChunkRepository chunkRepository, ObjectMapper objectMapper) {
        this(chunkRepository, objectMapper, AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }

    @Autowired
    public OverviewIdentityService(SourceChunkRepository chunkRepository, ObjectMapper objectMapper,
                                   AuralisProperties properties) {
        this(chunkRepository, objectMapper, properties == null
                ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : properties.ai().overviewLimits());
    }

    OverviewIdentityService(SourceChunkRepository chunkRepository, ObjectMapper objectMapper,
                            AuralisProperties.OverviewLimits overviewLimits) {
        this.chunkRepository = chunkRepository;
        this.objectMapper = objectMapper;
        this.overviewLimits = overviewLimits == null
                ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : overviewLimits;
    }

    public BoundIdentity bind(UUID userId, OverviewResponse result, OutlineIdentityInput input,
                              OutlineProvenanceInput provenanceInput, Map<UUID, UUID> currentSources,
                              String previousIdentityJson) {
        if (result == null || result.outline() == null || input == null || currentSources == null
                || input.schemaVersion() != SCHEMA_VERSION || input.nodes() == null) {
            throw invalid("A complete outline identity is required");
        }
        if (exceeds(overviewLimits.maxChapters(), result.outline().size())) {
            throw invalid("Outline identity exceeds the configured chapter limit");
        }
        long sectionCount = 0;
        for (OverviewChapter chapter : result.outline()) {
            if (chapter == null || chapter.sections() == null) throw invalid("Outline identity outline is invalid");
            sectionCount += chapter.sections().size();
        }
        if (exceeds(overviewLimits.maxSections(), sectionCount)) {
            throw invalid("Outline identity exceeds the configured section limit");
        }
        if (exceeds(overviewLimits.maxProvenanceSections(), sectionCount)) {
            throw invalid("Outline provenance exceeds the configured section limit");
        }
        OutlineIdentityView previous = parsePrevious(previousIdentityJson);
        Map<UUID, OutlineIdentityNodeView> previousById = new HashMap<>();
        if (previous != null) {
            for (OutlineIdentityNodeView node : previous.nodes()) {
                if (node == null || node.nodeId() == null || node.path() == null || node.contentVersion() <= 0
                        || node.contentHash() == null || !node.contentHash().matches("[0-9a-f]{64}")
                        || node.sourceRefs() == null || previousById.put(node.nodeId(), node) != null) {
                    throw internal("Stored outline identity is invalid");
                }
            }
        }

        Map<Path, OutlineIdentityNodeInput> submitted = new HashMap<>();
        Set<UUID> submittedIds = new HashSet<>();
        for (OutlineIdentityNodeInput node : input.nodes()) {
            if (node == null) throw invalid("Outline identity nodes cannot be null");
            Path path = path(node.path(), "outline identity path");
            if (submitted.put(path, node) != null) throw invalid("Outline identity paths must be unique");
            if (node.nodeId() != null && !submittedIds.add(node.nodeId())) {
                throw invalid("Outline node IDs must be unique");
            }
        }

        Set<Path> expectedPaths = new HashSet<>();
        for (int chapterIndex = 0; chapterIndex < result.outline().size(); chapterIndex++) {
            expectedPaths.add(new Path(List.of(chapterIndex)));
            for (int sectionIndex = 0; sectionIndex < result.outline().get(chapterIndex).sections().size(); sectionIndex++) {
                expectedPaths.add(new Path(List.of(chapterIndex, sectionIndex)));
            }
        }
        if (!submitted.keySet().equals(expectedPaths)) {
            throw invalid("Outline identity must contain exactly one entry for every chapter and section");
        }
        Map<Path, UUID> assignedIds = new HashMap<>();
        for (Path path : expectedPaths) {
            OutlineIdentityNodeInput node = submitted.get(path);
            UUID id = node.nodeId();
            if (id != null) {
                OutlineIdentityNodeView old = previousById.get(id);
                if (old == null || old.path().size() != path.segments().size()) {
                    throw invalid("Outline node ID is unknown or belongs to another result or node type");
                }
            } else {
                id = UUID.randomUUID();
            }
            assignedIds.put(path, id);
        }

        Map<Path, List<CanonicalSourceRefView>> sectionRefs = normalizeProvenance(
                userId, result.outline(), provenanceInput, currentSources);
        List<NodeDraft> drafts = new ArrayList<>();
        for (int chapterIndex = 0; chapterIndex < result.outline().size(); chapterIndex++) {
            OverviewChapter chapter = result.outline().get(chapterIndex);
            Path chapterPath = new Path(List.of(chapterIndex));
            List<NodeDraft> childDrafts = new ArrayList<>();
            List<CanonicalSourceRefView> chapterRefs = new ArrayList<>();
            for (int sectionIndex = 0; sectionIndex < chapter.sections().size(); sectionIndex++) {
                OverviewSection section = chapter.sections().get(sectionIndex);
                Path sectionPath = new Path(List.of(chapterIndex, sectionIndex));
                List<CanonicalSourceRefView> refs = sectionRefs.get(sectionPath);
                chapterRefs.addAll(refs);
                String contentHash = hash(List.of("AURALIS-OVERVIEW-SECTION-CONTENT-V1",
                        section.title(), section.summary(), section.sourceIds(), locator(section.locator()), refs));
                childDrafts.add(new NodeDraft(sectionPath, submitted.get(sectionPath), assignedIds.get(sectionPath),
                        contentHash, refs));
            }
            List<CanonicalSourceRefView> canonicalChapterRefs = canonicalOrder(chapterRefs);
            String chapterHash = hash(List.of("AURALIS-OVERVIEW-CHAPTER-CONTENT-V1", chapter.title(),
                    childDrafts.stream().map(child -> List.of(
                            child.nodeId().toString(), child.contentHash()))
                            .sorted(Comparator.comparing(item -> (String) item.getFirst()))
                            .toList()));
            drafts.add(new NodeDraft(chapterPath, submitted.get(chapterPath), assignedIds.get(chapterPath),
                    chapterHash, canonicalChapterRefs));
            drafts.addAll(childDrafts);
        }

        List<OutlineIdentityNodeView> nodes = new ArrayList<>(drafts.size());
        Map<Path, OutlineIdentityNodeView> outputByPath = new LinkedHashMap<>();
        for (NodeDraft draft : drafts) {
            OutlineIdentityNodeInput candidate = draft.input();
            UUID nodeId = draft.nodeId();
            OutlineIdentityNodeView old = candidate.nodeId() == null ? null : previousById.get(nodeId);
            long version = old == null ? 1 : old.contentHash().equals(draft.contentHash())
                    ? old.contentVersion() : old.contentVersion() + 1;
            OutlineIdentityNodeView view = new OutlineIdentityNodeView(draft.path().segments(), nodeId, version,
                    draft.contentHash(), canonicalOrder(draft.sourceRefs()));
            nodes.add(view);
            outputByPath.put(draft.path(), view);
        }
        OutlineIdentityView identity = new OutlineIdentityView(SCHEMA_VERSION, nodes);
        if (exceeds(overviewLimits.maxIdentityChars(), writeJson(identity).length())) {
            throw invalid("Outline identity metadata exceeds its configured size limit");
        }
        OutlineProvenanceView provenance = toProvenanceView(outputByPath, result.outline());
        return new BoundIdentity(identity, provenance);
    }

    public OutlineIdentityView parseIdentity(String json) {
        return parsePrevious(json);
    }

    public OutlineProvenanceView provenanceView(OutlineIdentityView identity, List<OverviewChapter> outline) {
        if (identity == null || outline == null) return null;
        Map<Path, OutlineIdentityNodeView> byPath = new HashMap<>();
        for (OutlineIdentityNodeView node : identity.nodes()) {
            byPath.put(path(node.path(), "stored outline identity path"), node);
        }
        return toProvenanceView(byPath, outline);
    }

    private Map<Path, List<CanonicalSourceRefView>> normalizeProvenance(
            UUID userId, List<OverviewChapter> outline, OutlineProvenanceInput input,
            Map<UUID, UUID> currentSources) {
        Map<Path, OutlineProvenanceSectionInput> supplied = new HashMap<>();
        if (input != null) {
            if (input.schemaVersion() != SCHEMA_VERSION || input.sections() == null
                    || exceeds(overviewLimits.maxProvenanceSections(), input.sections().size())) {
                throw invalid("Outline provenance schema is invalid");
            }
            for (OutlineProvenanceSectionInput section : input.sections()) {
                if (section == null) throw invalid("Outline provenance sections cannot be null");
                Path path = path(section.path(), "outline provenance path");
                if (path.segments().size() != 2 || supplied.put(path, section) != null) {
                    throw invalid("Outline provenance section paths must be unique");
                }
            }
        }
        Map<Path, List<CanonicalSourceRefView>> result = new LinkedHashMap<>();
        Set<Path> validPaths = new HashSet<>();
        long totalRefs = 0;
        long totalLocations = 0;
        for (int chapterIndex = 0; chapterIndex < outline.size(); chapterIndex++) {
            OverviewChapter chapter = outline.get(chapterIndex);
            for (int sectionIndex = 0; sectionIndex < chapter.sections().size(); sectionIndex++) {
                Path path = new Path(List.of(chapterIndex, sectionIndex));
                validPaths.add(path);
                OverviewSection section = chapter.sections().get(sectionIndex);
                OutlineProvenanceSectionInput entry = supplied.get(path);
                List<CanonicalSourceRefView> refs = new ArrayList<>();
                Set<UUID> sectionSources = new LinkedHashSet<>();
                for (String rawSourceId : section.sourceIds()) {
                    UUID sourceId;
                    try {
                        sourceId = UUID.fromString(rawSourceId);
                    } catch (RuntimeException exception) {
                        throw invalid("Section sourceIds must contain UUIDs");
                    }
                    if (!sectionSources.add(sourceId) || !currentSources.containsKey(sourceId)) {
                        throw invalid("Section sourceIds are outside the current overview scope");
                    }
                }
                Set<UUID> refsBySource = new HashSet<>();
                if (entry != null) {
                    if (entry.sourceRefs() == null || entry.sourceRefs().isEmpty()
                            || exceeds(overviewLimits.maxProvenanceRefsPerSection(), entry.sourceRefs().size())) {
                        throw invalid("Outline provenance sourceRefs are invalid");
                    }
                    for (OutlineProvenanceSourceRefInput ref : entry.sourceRefs()) {
                        if (ref == null || !sectionSources.contains(ref.sourceId())) {
                            throw invalid("Outline provenance source is not cited by its section");
                        }
                        refs.add(canonicalize(userId, ref, currentSources));
                        refsBySource.add(ref.sourceId());
                    }
                }
                for (UUID sourceId : sectionSources) {
                    if (!refsBySource.contains(sourceId)) {
                        refs.add(sourceOnly(sourceId, currentSources.get(sourceId)));
                    }
                }
                List<CanonicalSourceRefView> ordered = canonicalOrder(refs);
                if (exceeds(overviewLimits.maxProvenanceRefsPerSection(), ordered.size())) {
                    throw invalid("Outline provenance has too many source references");
                }
                totalRefs += ordered.size();
                if (exceeds(overviewLimits.maxProvenanceRefs(), totalRefs)) {
                    throw invalid("Outline provenance exceeds the configured total reference limit");
                }
                for (CanonicalSourceRefView ref : ordered) {
                    totalLocations += ref.locations() == null ? 0 : ref.locations().size();
                }
                if (exceeds(overviewLimits.maxProvenanceLocations(), totalLocations)) {
                    throw invalid("Outline provenance exceeds the configured total location limit");
                }
                result.put(path, ordered);
            }
        }
        if (!validPaths.containsAll(supplied.keySet())) {
            throw invalid("Outline provenance references a missing section");
        }
        return result;
    }

    private CanonicalSourceRefView canonicalize(UUID userId, OutlineProvenanceSourceRefInput ref,
                                                Map<UUID, UUID> currentSources) {
        UUID currentRevision = currentSources.get(ref.sourceId());
        if (currentRevision == null || !currentRevision.equals(ref.ingestionRevision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Outline provenance source revision is stale");
        }
        boolean anyChunkField = ref.chunkId() != null || ref.generation() != null
                || ref.charStart() != null || ref.charEnd() != null;
        boolean allChunkFields = ref.chunkId() != null && ref.generation() != null
                && ref.charStart() != null && ref.charEnd() != null;
        if (anyChunkField != allChunkFields) throw invalid("Exact source references require chunk, generation and range");
        if (!anyChunkField) return sourceOnly(ref.sourceId(), currentRevision);
        if (ref.charStart() < 0 || ref.charEnd() <= ref.charStart()) {
            throw invalid("Outline provenance range is invalid");
        }
        SourceChunkEntity chunk = chunkRepository.findById(ref.chunkId()).orElse(null);
        if (chunk == null || !chunk.getUserId().equals(userId) || !chunk.getSourceId().equals(ref.sourceId())
                || !chunk.getGeneration().equals(ref.generation()) || !chunk.isActive()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Outline provenance chunk is not current and authorized");
        }
        if (ref.charStart() < chunk.getCharStart() || ref.charEnd() > chunk.getCharEnd()) {
            throw invalid("Outline provenance range exceeds its source chunk");
        }
        List<ProvenanceLocationView> locations = new ArrayList<>();
        UUID parsedDocumentId = null;
        String parserId = null;
        if (chunk.getProvenanceJson() != null) {
            SourceChunkProvenance stored = readProvenance(chunk.getProvenanceJson());
            if (stored.schemaVersion() != SourceChunkProvenance.SCHEMA_VERSION
                    || !currentRevision.equals(stored.ingestionRevision())
                    || stored.parsedDocumentId() == null || stored.parserId() == null
                    || stored.locations() == null) {
                throw internal("Stored source chunk provenance is invalid");
            }
            parsedDocumentId = stored.parsedDocumentId();
            parserId = stored.parserId();
            for (SourceChunkProvenance.Location location : stored.locations()) {
                if (location == null || location.blockOrdinal() < 0 || location.charStart() < chunk.getCharStart()
                        || location.charEnd() > chunk.getCharEnd() || location.charEnd() <= location.charStart()
                        || location.blockCharStart() < 0 || location.blockCharEnd() <= location.blockCharStart()
                        || location.blockCharEnd() - location.blockCharStart()
                        != location.charEnd() - location.charStart()) {
                    throw internal("Stored source chunk location is invalid");
                }
                int start = Math.max(ref.charStart(), location.charStart());
                int end = Math.min(ref.charEnd(), location.charEnd());
                if (start >= end) continue;
                if (overviewLimits.maxProvenanceLocationsPerRef() > 0
                        && locations.size() >= overviewLimits.maxProvenanceLocationsPerRef()) {
                    throw invalid("Outline provenance has too many block locations");
                }
                int deltaStart = start - location.charStart();
                int deltaEnd = end - location.charStart();
                locations.add(new ProvenanceLocationView(location.blockOrdinal(), location.pageNumber(),
                        location.anchorIndex(), location.startLine(), start, end,
                        location.blockCharStart() + deltaStart, location.blockCharStart() + deltaEnd));
            }
            if (locations.isEmpty()) {
                throw invalid("Exact source range does not intersect accepted ParsedDocument text");
            }
        }
        ProvenancePrecision precision = locations.isEmpty() ? ProvenancePrecision.CHUNK : ProvenancePrecision.BLOCK;
        return new CanonicalSourceRefView(ref.sourceId(), currentRevision, chunk.getId(), chunk.getGeneration(),
                ref.charStart(), ref.charEnd(), chunk.getContentHash(), precision, parsedDocumentId, parserId,
                locations);
    }

    private CanonicalSourceRefView sourceOnly(UUID sourceId, UUID revision) {
        return new CanonicalSourceRefView(sourceId, revision, null, null, null, null,
                null, ProvenancePrecision.SOURCE, null, null, List.of());
    }

    private OutlineProvenanceView toProvenanceView(Map<Path, OutlineIdentityNodeView> nodes,
                                                   List<OverviewChapter> outline) {
        List<OutlineProvenanceSectionView> sections = new ArrayList<>();
        for (int chapterIndex = 0; chapterIndex < outline.size(); chapterIndex++) {
            for (int sectionIndex = 0; sectionIndex < outline.get(chapterIndex).sections().size(); sectionIndex++) {
                Path path = new Path(List.of(chapterIndex, sectionIndex));
                OutlineIdentityNodeView node = nodes.get(path);
                if (node != null) sections.add(new OutlineProvenanceSectionView(path.segments(), node.sourceRefs()));
            }
        }
        return new OutlineProvenanceView(SCHEMA_VERSION, sections);
    }

    private List<CanonicalSourceRefView> canonicalOrder(List<CanonicalSourceRefView> refs) {
        return List.copyOf(new LinkedHashSet<>(refs.stream().sorted(Comparator
                .comparing((CanonicalSourceRefView ref) -> ref.sourceId().toString())
                .thenComparing(ref -> ref.chunkId() == null ? "" : ref.chunkId().toString())
                .thenComparing(ref -> ref.charStart() == null ? -1 : ref.charStart())
                .thenComparing(ref -> ref.charEnd() == null ? -1 : ref.charEnd())
                .thenComparing(ref -> ref.generation() == null ? "" : ref.generation().toString()))
                .toList()));
    }

    private Object locator(OverviewLocator locator) {
        return locator == null ? List.of() : List.of(Objects.toString(locator.page(), ""),
                Objects.toString(locator.blockId(), ""));
    }

    private OutlineIdentityView parsePrevious(String json) {
        if (json == null || json.isBlank()) return null;
        if (exceeds(overviewLimits.maxIdentityChars(), json.length())) {
            throw internal("Stored outline identity is invalid");
        }
        try {
            OutlineIdentityView identity = objectMapper.readValue(json, OutlineIdentityView.class);
            if (identity == null || identity.schemaVersion() != SCHEMA_VERSION || identity.nodes() == null) {
                throw internal("Stored outline identity is invalid");
            }
            Set<Path> paths = new HashSet<>();
            Set<UUID> ids = new HashSet<>();
            for (OutlineIdentityNodeView node : identity.nodes()) {
                if (node == null || node.nodeId() == null || node.path() == null || node.contentVersion() <= 0
                        || node.contentHash() == null || !node.contentHash().matches("[0-9a-f]{64}")
                        || node.sourceRefs() == null || !paths.add(path(node.path(), "stored identity path"))
                        || !ids.add(node.nodeId())) {
                    throw internal("Stored outline identity is invalid");
                }
            }
            return identity;
        } catch (DomainException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored outline identity could not be read", null, exception);
        }
    }

    private SourceChunkProvenance readProvenance(String json) {
        if (json == null || json.length() > SourceChunkProvenance.MAX_JSON_CHARS) {
            throw internal("Stored source chunk provenance is invalid");
        }
        try {
            return objectMapper.readValue(json, SourceChunkProvenance.class);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored source chunk provenance could not be read", null, exception);
        }
    }

    private Path path(List<Integer> segments, String field) {
        if (segments == null || segments.isEmpty() || segments.size() > 2
                || segments.stream().anyMatch(value -> value == null || value < 0)) {
            throw invalid(field + " is invalid");
        }
        return new Path(List.copyOf(segments));
    }

    private String hash(Object value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(value));
            StringBuilder hex = new StringBuilder(64);
            for (byte item : digest) hex.append(String.format("%02x", item));
            return hex.toString();
        } catch (JacksonException | NoSuchAlgorithmException exception) {
            throw new DomainException("INTERNAL_ERROR", "Outline identity hash could not be computed", null, exception);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Outline identity metadata could not be encoded", null, exception);
        }
    }

    private DomainException invalid(String detail) {
        return new DomainException("VALIDATION_FAILED", detail);
    }

    private DomainException internal(String detail) {
        return new DomainException("INTERNAL_ERROR", detail);
    }

    private static boolean exceeds(long maximum, long actual) {
        return maximum > 0 && actual > maximum;
    }

    public record BoundIdentity(OutlineIdentityView outlineIdentity, OutlineProvenanceView outlineProvenance) {
    }

    private record Path(List<Integer> segments) {
    }

    private record NodeDraft(Path path, OutlineIdentityNodeInput input, UUID nodeId, String contentHash,
                             List<CanonicalSourceRefView> sourceRefs) {
    }
}
