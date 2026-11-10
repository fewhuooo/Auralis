package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityView;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceView;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.auralis.app.ai.internal.persistence.OverviewResultEntity;
import com.auralis.app.ai.internal.persistence.OverviewResultRepository;
import com.auralis.app.ai.internal.persistence.OverviewWriteReceiptEntity;
import com.auralis.app.ai.internal.persistence.OverviewWriteReceiptRepository;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.domain.OverviewResultChangedEvent;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.Optional;

@Service
public class OverviewResultService {
    private static final String SOURCE_SCOPE = "SOURCE";
    private static final String SUBJECT_SCOPE = "SUBJECT";

    private final OverviewResultRepository resultRepository;
    private final OverviewWriteReceiptRepository receiptRepository;
    private final IdentityService identityService;
    private final SourceService sourceService;
    private final SubjectService subjectService;
    private final OverviewDocumentValidator documentValidator;
    private final OverviewIdentityService overviewIdentityService;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final AuralisProperties.OverviewLimits overviewLimits;
    @Autowired(required = false)
    private OverviewGenerationService generationService;
    @Autowired(required = false)
    private OverviewCandidateInputResolver candidateInputResolver;

    public OverviewResultService(OverviewResultRepository resultRepository,
                                 OverviewWriteReceiptRepository receiptRepository,
                                 IdentityService identityService,
                                 SourceService sourceService,
                                 SubjectService subjectService,
                                 OverviewDocumentValidator documentValidator,
                                 OverviewIdentityService overviewIdentityService,
                                 ObjectMapper objectMapper,
                                 ApplicationEventPublisher eventPublisher) {
        this(resultRepository, receiptRepository, identityService, sourceService, subjectService,
                documentValidator, overviewIdentityService, objectMapper, eventPublisher,
                AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }

    @Autowired
    public OverviewResultService(OverviewResultRepository resultRepository,
                                 OverviewWriteReceiptRepository receiptRepository,
                                 IdentityService identityService,
                                 SourceService sourceService,
                                 SubjectService subjectService,
                                 OverviewDocumentValidator documentValidator,
                                 OverviewIdentityService overviewIdentityService,
                                 ObjectMapper objectMapper,
                                 ApplicationEventPublisher eventPublisher,
                                 AuralisProperties properties) {
        this(resultRepository, receiptRepository, identityService, sourceService, subjectService,
                documentValidator, overviewIdentityService, objectMapper, eventPublisher,
                properties == null ? AuralisProperties.OverviewLimits.withoutAdditionalCaps()
                        : properties.ai().overviewLimits());
    }

    OverviewResultService(OverviewResultRepository resultRepository,
                          OverviewWriteReceiptRepository receiptRepository,
                          IdentityService identityService,
                          SourceService sourceService,
                          SubjectService subjectService,
                          OverviewDocumentValidator documentValidator,
                          OverviewIdentityService overviewIdentityService,
                          ObjectMapper objectMapper,
                          ApplicationEventPublisher eventPublisher,
                          AuralisProperties.OverviewLimits overviewLimits) {
        this.resultRepository = resultRepository;
        this.receiptRepository = receiptRepository;
        this.identityService = identityService;
        this.sourceService = sourceService;
        this.subjectService = subjectService;
        this.documentValidator = documentValidator;
        this.overviewIdentityService = overviewIdentityService;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
        this.overviewLimits = overviewLimits == null
                ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : overviewLimits;
    }

    @Transactional
    public OverviewResultView getSource(UUID userId, UUID sourceId, UUID expectedRevision) {
        SourceView source = requireReadySource(userId, sourceId, null);
        if (expectedRevision != null && !expectedRevision.equals(source.ingestionRevision())) {
            throw notFound("Current source overview was not found for the requested ingestion revision");
        }
        OverviewResultEntity entity = resultRepository.findByUserIdAndScopeTypeAndScopeId(
                        userId, SOURCE_SCOPE, sourceId)
                .filter(value -> isCurrentSourceResult(userId, value, source))
                .orElseThrow(() -> notFound("Current source overview was not found"));
        return view(entity, source.subjectId());
    }

    @Transactional
    public Optional<OverviewResultView> readCurrentSource(UUID userId, UUID sourceId, UUID expectedRevision) {
        SourceView source = requireReadySource(userId, sourceId, null);
        if (!Objects.equals(expectedRevision, source.ingestionRevision())) {
            throw new DomainException("SOURCE_SCOPE_CHANGED", "Source changed during this Chat run");
        }
        return resultRepository.findByUserIdAndScopeTypeAndScopeId(userId, SOURCE_SCOPE, sourceId)
                .filter(entity -> isCurrentSourceResult(userId, entity, source))
                .map(entity -> view(entity, source.subjectId()));
    }

    @Transactional(readOnly = true)
    public Set<UUID> currentSourceOverviewIds(UUID userId, Map<UUID, UUID> expectedRevisions) {
        if (expectedRevisions.isEmpty()) return Set.of();
        Map<UUID, SourceView> currentSources = sourceService.findActiveViewsByIds(userId, expectedRevisions.keySet())
                .stream().collect(java.util.stream.Collectors.toMap(SourceView::id, source -> source));
        Map<UUID, OverviewResultEntity> results = resultRepository.findAllByUserIdAndScopeTypeAndScopeIdIn(
                        userId, SOURCE_SCOPE, expectedRevisions.keySet()).stream()
                .collect(java.util.stream.Collectors.toMap(OverviewResultEntity::getScopeId, result -> result));
        return expectedRevisions.entrySet().stream().filter(entry -> {
            SourceView source = currentSources.get(entry.getKey());
            OverviewResultEntity result = results.get(entry.getKey());
            return source != null && entry.getValue().equals(source.ingestionRevision())
                    && source.ingestionStatus() == SourceIngestionStatus.READY
                    && result != null && isCurrentSourceResult(userId, result, source);
        }).map(Map.Entry::getKey).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    @Transactional(noRollbackFor = DomainException.class)
    public OverviewResultView putSource(UUID userId, UUID sourceId, OverviewResultCommand command) {
        identityService.lockUserForScheduling(userId);
        SourceView source = requireReadySource(userId, sourceId, null);
        validateSourceWrite(source, command);
        OverviewResultEntity existing = resultRepository.findByUserIdAndScopeTypeAndScopeId(userId, SOURCE_SCOPE, sourceId).orElse(null);
        OverviewInputDescriptor input;
        if (command.candidateInput() == null) {
            input = resolveManualInputDescriptor(userId, SOURCE_SCOPE, sourceId, command, existing, List.of(), source);
        } else {
            validateCandidateInputShape(command);
            input = resolveCandidateInput(userId, SOURCE_SCOPE, sourceId, command);
        }
        OverviewResponse validated = validateResult(command, input.sourceIds());
        String requestHash = payloadHash(SOURCE_SCOPE, sourceId, command, null);
        OverviewResultView replay = replay(userId, SOURCE_SCOPE, sourceId, command, requestHash);
        if (replay != null) return withSubjectId(replay, source.subjectId());

        OverviewResultEntity entity = resultRepository.findForUpdate(userId, SOURCE_SCOPE, sourceId).orElse(null);
        boolean current = entity != null && isCurrentSourceResult(userId, entity, source);
        checkBaseVersion(entity, current, command);
        boolean updateOutline = command.mode() != OverviewMode.SUMMARY;
        boolean updateSummary = command.mode() != OverviewMode.OUTLINE;
        OutlineIdentityView identity = null;
        if (updateOutline) {
            OutlineProvenanceInput provenance = command.outlineProvenance() != null
                    ? command.outlineProvenance() : command.result().outlineProvenance();
            identity = overviewIdentityService.bind(userId, validated, command.outlineIdentity(), provenance,
                    Map.of(source.id(), source.ingestionRevision()), !current || entity == null
                            ? null : entity.getOutlineIdentityJson())
                    .outlineIdentity();
        }
        if (entity == null) {
            entity = new OverviewResultEntity(UUID.randomUUID(), userId, SOURCE_SCOPE, sourceId,
                    source.subjectId(), sourceId, source.ingestionRevision());
        }
        entity.apply(validated.title(), validated.schemaVersion(), updateOutline ? writeJson(validated.outline()) : null,
                updateSummary ? writeJson(validated.summary()) : null,
                updateOutline ? writeJson(identity) : entity.getOutlineIdentityJson(), null, null,
                updateOutline ? input.inputFingerprint() : entity.getOutlineInputFingerprint(),
                updateSummary ? input.inputFingerprint() : entity.getSummaryInputFingerprint(),
                generatedAt(command.outlineGeneratedAt(), updateOutline), generatedAt(command.summaryGeneratedAt(), updateSummary),
                updateOutline, updateSummary, source.ingestionRevision());
        String snapshot = input.origin() == OverviewInputDescriptor.Origin.SOURCE_CONTENT ? writeInputSnapshot(input) : null;
        entity.applyInputDescriptors(input.origin().name(), snapshot, input.origin().name(), snapshot,
                updateOutline, updateSummary);
        OverviewResultEntity saved = resultRepository.saveAndFlush(entity);
        OverviewResultView response = view(saved, source.subjectId());
        saveReceipt(userId, SOURCE_SCOPE, sourceId, command, requestHash, response);
        eventPublisher.publishEvent(new OverviewResultChangedEvent(userId, SOURCE_SCOPE, sourceId,
                response.version(), response.updatedAt()));
        return response;
    }

    /** Trusted server path used only by the durable publication service after its job/plan fences pass. */
    @Transactional(noRollbackFor = DomainException.class)
    public OverviewResultView publishNative(UUID userId, String scopeType, UUID scopeId, long baseVersion,
                                            UUID expectedResultId, Long expectedResultVersion,
                                            UUID clientWriteId, OverviewMode mode, OverviewResponse candidate,
                                            OverviewInputDescriptor input) {
        identityService.lockUserForScheduling(userId);
        if (input == null || input.origin() != OverviewInputDescriptor.Origin.SOURCE_CONTENT
                || !scopeType.equals(input.scopeType()) || !scopeId.equals(input.scopeId()) || generationService == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Native publication input descriptor is invalid");
        }
        SourceView source = null;
        if (SOURCE_SCOPE.equals(scopeType)) {
            source = requireReadySource(userId, scopeId, null);
            if (!input.sourceIds().equals(List.of(scopeId))) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Native source scope changed");
        } else if (SUBJECT_SCOPE.equals(scopeType)) {
            subjectService.requireActiveSubjectForMutation(userId, scopeId);
            for (UUID sourceId : input.sourceIds()) sourceService.requireActiveSourceForMutation(userId, sourceId, scopeId);
        } else throw new DomainException("VALIDATION_FAILED", "Native publication scope is invalid");
        OverviewJobDtos.Scope scope = OverviewJobDtos.Scope.valueOf(scopeType);
        OverviewInputDescriptor currentInput = generationService.currentRawInputDescriptor(userId, scope, scopeId, input.sourceIds());
        if (!input.equals(currentInput)) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Native publication input changed");
        OverviewResultEntity entity = resultRepository.findForUpdate(userId, scopeType, scopeId).orElse(null);
        if (!Objects.equals(entity == null ? null : entity.getId(), expectedResultId)
                || !Objects.equals(entity == null ? null : entity.getVersion(), expectedResultVersion)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Formal result changed after the job captured its publication baseline");
        }
        boolean current = entity != null && (SOURCE_SCOPE.equals(scopeType)
                ? isCurrentSourceResult(userId, entity, source)
                : isCurrentSubjectResult(userId, entity, currentSubjectManifest(userId, scopeId)));
        if (current) {
            if (entity.getVersion() != baseVersion) throw versionConflict(entity);
        } else if (baseVersion != 0 || mode != OverviewMode.ALL) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "A complete current result is required for OUTLINE publication");
        }
        OverviewResultCommand command = new OverviewResultCommand(baseVersion, clientWriteId, mode,
                SOURCE_SCOPE.equals(scopeType) ? source.ingestionRevision() : null, null, input.inputFingerprint(),
                mode == OverviewMode.OUTLINE || mode == OverviewMode.ALL ? Instant.now() : null,
                mode == OverviewMode.ALL ? Instant.now() : null, candidate, null, null, input);
        OverviewResponse validated = validateResult(command, input.sourceIds());
        boolean updateOutline = mode != OverviewMode.SUMMARY;
        boolean updateSummary = mode != OverviewMode.OUTLINE;
        if (mode == OverviewMode.SUMMARY) throw new DomainException("VALIDATION_FAILED", "Native background publication does not support SUMMARY");
        if (updateOutline && mode == OverviewMode.OUTLINE && (!current || entity == null || !complete(entity))) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "OUTLINE publication requires a current complete result");
        }
        OutlineIdentityView identity = null;
        if (updateOutline) {
            Map<UUID, UUID> revisions = new LinkedHashMap<>();
            input.sourceRevisions().forEach(entry -> revisions.put(entry.sourceId(), entry.ingestionRevision()));
            identity = overviewIdentityService.bind(userId, validated, serverIdentityInput(validated,
                            current && entity != null ? entity.getOutlineIdentityJson() : null),
                    candidate.outlineProvenance(),
                    Map.copyOf(revisions), current && entity != null ? entity.getOutlineIdentityJson() : null).outlineIdentity();
        }
        if (entity == null) {
            UUID subjectId = SOURCE_SCOPE.equals(scopeType) ? source.subjectId() : scopeId;
            entity = new OverviewResultEntity(UUID.randomUUID(), userId, scopeType, scopeId, subjectId,
                    SOURCE_SCOPE.equals(scopeType) ? scopeId : null,
                    SOURCE_SCOPE.equals(scopeType) ? source.ingestionRevision() : null);
        }
        String snapshot = writeInputSnapshot(input);
        entity.apply(validated.title(), validated.schemaVersion(), updateOutline ? writeJson(validated.outline()) : null,
                updateSummary ? writeJson(validated.summary()) : null,
                updateOutline ? writeJson(identity) : entity.getOutlineIdentityJson(),
                updateOutline ? null : entity.getOutlineSourceManifest(),
                updateSummary ? null : entity.getSummarySourceManifest(),
                updateOutline ? input.inputFingerprint() : entity.getOutlineInputFingerprint(),
                updateSummary ? input.inputFingerprint() : entity.getSummaryInputFingerprint(),
                updateOutline ? generatedAt(null, true) : entity.getOutlineGeneratedAt(),
                updateSummary ? generatedAt(null, true) : entity.getSummaryGeneratedAt(),
                updateOutline, updateSummary, SOURCE_SCOPE.equals(scopeType) ? source.ingestionRevision() : null);
        entity.applyInputDescriptors(input.origin().name(), snapshot, input.origin().name(), snapshot,
                updateOutline, updateSummary);
        OverviewResultEntity saved = resultRepository.saveAndFlush(entity);
        OverviewResultView response = SOURCE_SCOPE.equals(scopeType) ? view(saved, source.subjectId()) : view(saved);
        String requestHash = payloadHash(scopeType, scopeId, command, null);
        saveReceipt(userId, scopeType, scopeId, command, requestHash, response);
        eventPublisher.publishEvent(new OverviewResultChangedEvent(userId, scopeType, scopeId,
                response.version(), response.updatedAt()));
        return response;
    }

    @Transactional
    public OverviewResultView getSubject(UUID userId, UUID subjectId) {
        subjectService.requireActiveSubjectForMutation(userId, subjectId);
        List<OverviewSourceManifestEntry> allInputs = currentSubjectManifest(userId, subjectId);
        OverviewResultEntity entity = resultRepository.findByUserIdAndScopeTypeAndScopeId(
                        userId, SUBJECT_SCOPE, subjectId)
                .filter(value -> isCurrentSubjectResult(userId, value, allInputs))
                .orElseThrow(() -> notFound("Current subject overview was not found"));
        return view(entity);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public OverviewSubjectStatusesResponse getSubjectStatuses(UUID userId, OverviewSubjectStatusesRequest request) {
        List<UUID> subjectIds = new ArrayList<>(new LinkedHashSet<>(request.subjectIds()));
        Map<UUID, OverviewResultEntity> resultsBySubjectId = new HashMap<>();
        for (OverviewResultEntity result : resultRepository.findAllByUserIdAndScopeTypeAndScopeIdIn(
                userId, SUBJECT_SCOPE, subjectIds)) {
            resultsBySubjectId.put(result.getScopeId(), result);
        }
        Set<UUID> activeSubjectIds = subjectService.findActiveSubjectIds(userId, subjectIds);

        List<OverviewSubjectStatusesResponse.Item> items = new ArrayList<>(subjectIds.size());
        for (UUID subjectId : subjectIds) {
            if (!activeSubjectIds.contains(subjectId)) {
                items.add(new OverviewSubjectStatusesResponse.Item(subjectId,
                        OverviewSubjectStatusesResponse.Status.UNAVAILABLE, null, null, null, null));
                continue;
            }

            OverviewResultEntity result = resultsBySubjectId.get(subjectId);
            if (result == null) {
                items.add(new OverviewSubjectStatusesResponse.Item(subjectId,
                        OverviewSubjectStatusesResponse.Status.MISSING, null, null, null, null));
                continue;
            }

            boolean current;
            try {
                List<OverviewSourceManifestEntry> currentInputs = currentSubjectManifest(userId, subjectId);
                current = isCurrentSubjectResult(userId, result, currentInputs);
            } catch (DomainException invalidInputs) {
                if (!"VALIDATION_FAILED".equals(invalidInputs.code())) throw invalidInputs;
                current = false;
            }
            if (!current) {
                items.add(new OverviewSubjectStatusesResponse.Item(subjectId,
                        OverviewSubjectStatusesResponse.Status.MISSING, null, null, null, null));
                continue;
            }
            items.add(new OverviewSubjectStatusesResponse.Item(subjectId,
                    OverviewSubjectStatusesResponse.Status.AVAILABLE, result.getVersion(), result.getOutlineVersion(),
                    result.getSummaryVersion(), result.getUpdatedAt()));
        }
        return new OverviewSubjectStatusesResponse(items);
    }

    @Transactional
    public OverviewOutlineView getSourceOutline(UUID userId, UUID sourceId) {
        return outline(getSource(userId, sourceId, null));
    }

    @Transactional
    public OverviewOutlineView getSubjectOutline(UUID userId, UUID subjectId) {
        return outline(getSubject(userId, subjectId));
    }

    @Transactional
    public OverviewSectionView getSourceSection(UUID userId, UUID sourceId, UUID sectionId, long expectedVersion) {
        return section(getSource(userId, sourceId, null), sectionId, expectedVersion);
    }

    @Transactional
    public OverviewSectionView getSubjectSection(UUID userId, UUID subjectId, UUID sectionId, long expectedVersion) {
        return section(getSubject(userId, subjectId), sectionId, expectedVersion);
    }

    private OverviewOutlineView outline(OverviewResultView result) {
        if (!result.identityReady() || result.outlineIdentity() == null || result.outline() == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Current Overview does not have stable section identities");
        }
        Map<List<Integer>, UUID> ids = new HashMap<>();
        result.outlineIdentity().nodes().forEach(node -> ids.put(node.path(), node.nodeId()));
        List<OverviewOutlineView.OutlineNode> nodes = new ArrayList<>();
        for (int chapterIndex = 0; chapterIndex < result.outline().size(); chapterIndex++) {
            OverviewChapter chapter = result.outline().get(chapterIndex);
            List<Integer> chapterPath = List.of(chapterIndex);
            UUID chapterId = ids.get(chapterPath);
            if (chapterId == null) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Current Overview chapter identity is missing");
            nodes.add(new OverviewOutlineView.OutlineNode(chapterId, chapterPath, chapter.title(), true));
            for (int sectionIndex = 0; sectionIndex < chapter.sections().size(); sectionIndex++) {
                OverviewSection section = chapter.sections().get(sectionIndex);
                List<Integer> path = List.of(chapterIndex, sectionIndex);
                UUID sectionId = ids.get(path);
                if (sectionId == null) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Current Overview section identity is missing");
                nodes.add(new OverviewOutlineView.OutlineNode(sectionId, path, section.title(), false));
            }
        }
        return new OverviewOutlineView(result.id(), result.scopeType(), result.version(), nodes);
    }

    private OverviewSectionView section(OverviewResultView result, UUID sectionId, long expectedVersion) {
        if (expectedVersion <= 0 || result.version() != expectedVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview result version changed");
        }
        if (!result.identityReady() || result.outlineIdentity() == null || result.outline() == null
                || result.outlineProvenance() == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Current Overview does not have canonical section provenance");
        }
        OverviewIdentityDtos.OutlineIdentityNodeView identity = result.outlineIdentity().nodes().stream()
                .filter(node -> sectionId.equals(node.nodeId())).findFirst()
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Overview section was not found"));
        List<Integer> path = identity.path();
        if (path == null || path.size() != 2 || path.get(0) >= result.outline().size()
                || path.get(1) >= result.outline().get(path.get(0)).sections().size()) {
            throw new DomainException("RESOURCE_NOT_FOUND", "Overview section was not found");
        }
        OverviewChapter chapter = result.outline().get(path.get(0));
        OverviewSection section = chapter.sections().get(path.get(1));
        OverviewIdentityDtos.OutlineProvenanceSectionView provenance = result.outlineProvenance().sections().stream()
                .filter(entry -> path.equals(entry.path())).findFirst()
                .orElseThrow(() -> new DomainException("RESOURCE_VERSION_CONFLICT", "Overview section provenance is missing"));
        return new OverviewSectionView(result.id(), sectionId, result.version(), chapter.title(), path, section,
                provenance.sourceRefs());
    }

    @Transactional(noRollbackFor = DomainException.class)
    public OverviewResultView putSubject(UUID userId, UUID subjectId, OverviewResultCommand command) {
        identityService.lockUserForScheduling(userId);
        subjectService.requireActiveSubjectForMutation(userId, subjectId);
        if (command.candidateInput() != null) {
            validateCandidateInputShape(command);
            OverviewInputDescriptor input = resolveCandidateInput(userId, SUBJECT_SCOPE, subjectId, command);
            return putSubjectWithCandidateInput(userId, subjectId, command, input);
        }
        if (command.inputDescriptor() != null) {
            return putSubjectWithExplicitInput(userId, subjectId, command);
        }
        List<OverviewSourceManifestEntry> allInputs = currentSubjectManifest(userId, subjectId);
        List<OverviewSourceManifestEntry> requestManifest = projectedManifest(allInputs, command.mode());
        validateSubjectWrite(command, allInputs, requestManifest);
        OverviewResponse validated = validateResult(command, allInputs.stream()
                .map(OverviewSourceManifestEntry::sourceId).toList());
        String requestHash = payloadHash(SUBJECT_SCOPE, subjectId, command, requestManifest);
        OverviewResultView replay = replay(userId, SUBJECT_SCOPE, subjectId, command, requestHash);
        if (replay != null) return replay;

        OverviewResultEntity entity = resultRepository.findForUpdate(userId, SUBJECT_SCOPE, subjectId).orElse(null);
        boolean current = entity != null && isCurrentSubjectResult(userId, entity, allInputs);
        checkBaseVersion(entity, current, command);
        boolean updateOutline = command.mode() != OverviewMode.SUMMARY;
        boolean updateSummary = command.mode() != OverviewMode.OUTLINE;
        OutlineIdentityView identity = null;
        if (updateOutline) {
            OutlineProvenanceInput provenance = command.outlineProvenance() != null
                    ? command.outlineProvenance() : command.result().outlineProvenance();
            identity = overviewIdentityService.bind(userId, validated, command.outlineIdentity(), provenance,
                    sourceRevisionMap(allInputs), !current || entity == null
                            ? null : entity.getOutlineIdentityJson())
                    .outlineIdentity();
        }
        if (entity == null) {
            entity = new OverviewResultEntity(UUID.randomUUID(), userId, SUBJECT_SCOPE, subjectId,
                    subjectId, null, null);
        }
        List<OverviewSourceManifestEntry> outlineManifest = updateOutline
                ? projectedManifest(allInputs, OverviewMode.OUTLINE) : readManifest(entity.getOutlineSourceManifest());
        List<OverviewSourceManifestEntry> summaryManifest = updateSummary
                ? projectedManifest(allInputs, OverviewMode.SUMMARY) : readManifest(entity.getSummarySourceManifest());
        String outlineFingerprint = updateOutline ? subjectFingerprint(allInputs, OverviewMode.OUTLINE)
                : entity.getOutlineInputFingerprint();
        String summaryFingerprint = updateSummary ? subjectFingerprint(allInputs, OverviewMode.SUMMARY)
                : entity.getSummaryInputFingerprint();
        entity.apply(validated.title(), validated.schemaVersion(), updateOutline ? writeJson(validated.outline()) : null,
                updateSummary ? writeJson(validated.summary()) : null,
                updateOutline ? writeJson(identity) : entity.getOutlineIdentityJson(),
                updateOutline ? writeSourceManifest(outlineManifest) : entity.getOutlineSourceManifest(),
                updateSummary ? writeSourceManifest(summaryManifest) : entity.getSummarySourceManifest(),
                outlineFingerprint, summaryFingerprint,
                updateOutline ? generatedAt(command.outlineGeneratedAt(), true) : entity.getOutlineGeneratedAt(),
                updateSummary ? generatedAt(command.summaryGeneratedAt(), true) : entity.getSummaryGeneratedAt(),
                updateOutline, updateSummary, null);
        OverviewInputDescriptor outlineInput = subjectPartDescriptor(subjectId, outlineManifest, outlineFingerprint);
        OverviewInputDescriptor summaryInput = subjectPartDescriptor(subjectId, summaryManifest, summaryFingerprint);
        entity.applyInputDescriptors(outlineInput.origin().name(), null, summaryInput.origin().name(), null,
                updateOutline, updateSummary);
        OverviewResultEntity saved = resultRepository.saveAndFlush(entity);
        OverviewResultView response = view(saved);
        saveReceipt(userId, SUBJECT_SCOPE, subjectId, command, requestHash, response);
        eventPublisher.publishEvent(new OverviewResultChangedEvent(userId, SUBJECT_SCOPE, subjectId,
                response.version(), response.updatedAt()));
        return response;
    }

    private OverviewResultView putSubjectWithExplicitInput(UUID userId, UUID subjectId, OverviewResultCommand command) {
        return putSubjectWithInput(userId, subjectId, command, command.inputDescriptor(), false);
    }

    private OverviewResultView putSubjectWithCandidateInput(UUID userId, UUID subjectId,
                                                             OverviewResultCommand command,
                                                             OverviewInputDescriptor input) {
        return putSubjectWithInput(userId, subjectId, command, input, true);
    }

    private OverviewResultView putSubjectWithInput(UUID userId, UUID subjectId, OverviewResultCommand command,
                                                   OverviewInputDescriptor input, boolean candidateAdoption) {
        OverviewResultEntity existing = resultRepository.findByUserIdAndScopeTypeAndScopeId(userId, SUBJECT_SCOPE, subjectId)
                .orElse(null);
        if (!candidateAdoption && existing == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "An existing native input binding is required");
        }
        boolean updateOutline = command.mode() != OverviewMode.SUMMARY;
        boolean updateSummary = command.mode() != OverviewMode.OUTLINE;
        if (input.origin() != OverviewInputDescriptor.Origin.SOURCE_CONTENT || !SUBJECT_SCOPE.equals(input.scopeType())
                || !subjectId.equals(input.scopeId()) || input.sourceIds().isEmpty()
                || candidateAdoption && (generationService == null
                    || !input.equals(generationService.currentRawInputDescriptor(userId, OverviewJobDtos.Scope.SUBJECT,
                            subjectId, input.sourceIds())))
                || !candidateAdoption && updateOutline && (!isCurrentRawContentPart(userId, existing, true, SUBJECT_SCOPE, subjectId)
                    || !Objects.equals(input, readInputDescriptor(existing, true)))
                || !candidateAdoption && updateSummary && (!isCurrentRawContentPart(userId, existing, false, SUBJECT_SCOPE, subjectId)
                    || !Objects.equals(input, readInputDescriptor(existing, false)))) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Manual edit must retain the current native input binding");
        }
        OverviewResponse validated = validateResult(command, input.sourceIds());
        String requestHash = payloadHash(SUBJECT_SCOPE, subjectId, command, null);
        OverviewResultView replay = replay(userId, SUBJECT_SCOPE, subjectId, command, requestHash);
        if (replay != null) return replay;
        OverviewResultEntity entity = resultRepository.findForUpdate(userId, SUBJECT_SCOPE, subjectId).orElse(null);
        boolean current = entity != null && isCurrentSubjectResult(userId, entity, currentSubjectManifest(userId, subjectId));
        checkBaseVersion(entity, current && complete(entity), command);
        if (entity == null) {
            entity = new OverviewResultEntity(UUID.randomUUID(), userId, SUBJECT_SCOPE, subjectId,
                    subjectId, null, null);
        }
        OutlineIdentityView identity = null;
        if (updateOutline) {
            OutlineProvenanceInput provenance = command.outlineProvenance() != null
                    ? command.outlineProvenance() : command.result().outlineProvenance();
            identity = overviewIdentityService.bind(userId, validated, command.outlineIdentity(), provenance,
                    sourceRevisionMap(input.sourceRevisions().stream().map(value -> new OverviewSourceManifestEntry(
                            value.sourceId(), value.ingestionRevision(), null, null)).toList()),
                    current ? entity.getOutlineIdentityJson() : null).outlineIdentity();
        }
        entity.apply(validated.title(), validated.schemaVersion(), updateOutline ? writeJson(validated.outline()) : null,
                updateSummary ? writeJson(validated.summary()) : null,
                updateOutline ? writeJson(identity) : entity.getOutlineIdentityJson(),
                updateOutline ? null : entity.getOutlineSourceManifest(),
                updateSummary ? null : entity.getSummarySourceManifest(),
                updateOutline ? input.inputFingerprint() : entity.getOutlineInputFingerprint(),
                updateSummary ? input.inputFingerprint() : entity.getSummaryInputFingerprint(),
                updateOutline ? generatedAt(command.outlineGeneratedAt(), true) : entity.getOutlineGeneratedAt(),
                updateSummary ? generatedAt(command.summaryGeneratedAt(), true) : entity.getSummaryGeneratedAt(),
                updateOutline, updateSummary, null);
        String snapshot = writeInputSnapshot(input);
        entity.applyInputDescriptors(input.origin().name(), snapshot, input.origin().name(), snapshot, updateOutline, updateSummary);
        OverviewResultEntity saved = resultRepository.saveAndFlush(entity);
        OverviewResultView response = view(saved);
        saveReceipt(userId, SUBJECT_SCOPE, subjectId, command, requestHash, response);
        eventPublisher.publishEvent(new OverviewResultChangedEvent(userId, SUBJECT_SCOPE, subjectId,
                response.version(), response.updatedAt()));
        return response;
    }

    private void validateCandidateInputShape(OverviewResultCommand command) {
        if (command.mode() != OverviewMode.ALL && command.mode() != OverviewMode.OUTLINE
                || command.inputDescriptor() != null
                || command.sourceManifest() != null && !command.sourceManifest().isEmpty()
                || command.inputFingerprint() != null) {
            throw new DomainException("VALIDATION_FAILED", "candidateInput is exclusive with explicit input fields and requires ALL or OUTLINE mode");
        }
    }

    private OverviewInputDescriptor resolveCandidateInput(UUID userId, String scopeType, UUID scopeId,
                                                           OverviewResultCommand command) {
        if (candidateInputResolver == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Candidate input resolver is unavailable");
        }
        return candidateInputResolver.resolve(userId, scopeType, scopeId, command.mode(), command.candidateInput());
    }

    private SourceView requireReadySource(UUID userId, UUID sourceId, UUID expectedRevision) {
        SourceView source = sourceService.requireActiveSourceForMutation(userId, sourceId);
        if (source.ingestionStatus() != SourceIngestionStatus.READY || source.ingestionRevision() == null) {
            throw new DomainException("MUTATION_REJECTED", "Source must be READY before its overview can be stored");
        }
        if (expectedRevision != null && !expectedRevision.equals(source.ingestionRevision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Source overview ingestion revision is stale");
        }
        return source;
    }

    private void validateSourceWrite(SourceView source, OverviewResultCommand command) {
        if (command.ingestionRevision() == null || !command.ingestionRevision().equals(source.ingestionRevision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Source overview ingestion revision is stale");
        }
        if (command.sourceManifest() != null && !command.sourceManifest().isEmpty()) {
            throw new DomainException("VALIDATION_FAILED", "Source overview does not accept a subject source manifest");
        }
    }

    private OverviewInputDescriptor resolveManualInputDescriptor(UUID userId, String scopeType, UUID scopeId,
                                                                 OverviewResultCommand command,
                                                                 OverviewResultEntity existing,
                                                                 List<OverviewSourceManifestEntry> allInputs,
                                                                 SourceView source) {
        OverviewInputDescriptor supplied = command.inputDescriptor();
        if (supplied == null) {
            if (SOURCE_SCOPE.equals(scopeType)) {
                return new OverviewInputDescriptor(OverviewInputDescriptor.Origin.SOURCE_REVISION, scopeType, scopeId,
                        List.of(scopeId), List.of(new OverviewInputDescriptor.SourceRevision(scopeId, source.ingestionRevision())),
                        List.of(), List.of(), sourceRevisionFingerprint(scopeId, source.ingestionRevision()));
            }
            OverviewMode dependencies = command.mode() == OverviewMode.OUTLINE ? OverviewMode.OUTLINE : OverviewMode.SUMMARY;
            List<OverviewSourceManifestEntry> parts = projectedManifest(allInputs, dependencies);
            return new OverviewInputDescriptor(OverviewInputDescriptor.Origin.SOURCE_OVERVIEW_PARTS, scopeType, scopeId,
                    parts.stream().map(OverviewSourceManifestEntry::sourceId).toList(),
                    parts.stream().map(entry -> new OverviewInputDescriptor.SourceRevision(entry.sourceId(), entry.ingestionRevision())).toList(),
                    List.of(), parts, subjectFingerprint(allInputs, dependencies));
        }
        if (supplied.origin() != OverviewInputDescriptor.Origin.SOURCE_CONTENT
                || !scopeType.equals(supplied.scopeType()) || !scopeId.equals(supplied.scopeId())
                || supplied.sourceIds().isEmpty() || exceeds(overviewLimits.maxSources(), supplied.sourceIds().size())
                || generationService == null) {
            throw new DomainException("VALIDATION_FAILED", "Manual input descriptor is unsupported for this scope");
        }
        OverviewInputDescriptor authorized = existing == null ? null : readInputDescriptor(existing, true);
        boolean updateOutline = command.mode() != OverviewMode.SUMMARY;
        boolean updateSummary = command.mode() != OverviewMode.OUTLINE;
        OverviewInputDescriptor summaryBinding = existing == null ? null : readInputDescriptor(existing, false);
        if (authorized == null || updateOutline && (!Objects.equals(supplied, authorized)
                || !isCurrentRawContentPart(userId, existing, true, scopeType, scopeId))
                || updateSummary && (!Objects.equals(supplied, summaryBinding)
                || !isCurrentRawContentPart(userId, existing, false, scopeType, scopeId))) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Manual input descriptor is not a current persisted binding");
        }
        return authorized;
    }

    private OverviewInputDescriptor subjectPartDescriptor(UUID subjectId,
                                                           List<OverviewSourceManifestEntry> parts,
                                                           String fingerprint) {
        return new OverviewInputDescriptor(OverviewInputDescriptor.Origin.SOURCE_OVERVIEW_PARTS,
                SUBJECT_SCOPE, subjectId, parts.stream().map(OverviewSourceManifestEntry::sourceId).toList(),
                parts.stream().map(entry -> new OverviewInputDescriptor.SourceRevision(
                        entry.sourceId(), entry.ingestionRevision())).toList(), List.of(), parts, fingerprint);
    }

    private OutlineIdentityInput serverIdentityInput(OverviewResponse result, String previousIdentityJson) {
        List<OutlineIdentityNodeInput> nodes = new ArrayList<>();
        OutlineIdentityView previous = overviewIdentityService.parseIdentity(previousIdentityJson);
        Map<List<Integer>, UUID> ids = new HashMap<>();
        if (previous != null) previous.nodes().forEach(node -> ids.put(node.path(), node.nodeId()));
        for (int chapter = 0; chapter < result.outline().size(); chapter++) {
            nodes.add(new OutlineIdentityNodeInput(List.of(chapter), ids.get(List.of(chapter))));
            for (int section = 0; section < result.outline().get(chapter).sections().size(); section++) {
                nodes.add(new OutlineIdentityNodeInput(List.of(chapter, section), ids.get(List.of(chapter, section))));
            }
        }
        return new OutlineIdentityInput(OverviewIdentityService.SCHEMA_VERSION, nodes);
    }

    private void validateSubjectWrite(OverviewResultCommand command, List<OverviewSourceManifestEntry> allInputs,
                                      List<OverviewSourceManifestEntry> requestManifest) {
        if (command.ingestionRevision() != null) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview does not accept an ingestion revision");
        }
        if (requestManifest.isEmpty() || exceeds(overviewLimits.maxSources(), requestManifest.size())) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview requires READY sources within its configured limit");
        }
        requireModeInputsAvailable(allInputs, command.mode());
        if (command.sourceManifest() != null
                && exceeds(overviewLimits.maxSourceManifestChars(), writeJson(command.sourceManifest()).length())) {
            throw new DomainException("VALIDATION_FAILED", "Overview source manifest exceeds its configured size limit");
        }
        List<OverviewSourceManifestEntry> submitted = sortedManifest(command.sourceManifest());
        if (command.sourceManifest() == null || submitted.size() != requestManifest.size()
                || !submitted.equals(requestManifest)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Subject overview source manifest is stale");
        }
        String expected = subjectFingerprint(allInputs, command.mode());
        if (command.inputFingerprint() == null || !command.inputFingerprint().equals(expected)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Subject overview input fingerprint is stale");
        }
    }

    private OverviewResponse validateResult(OverviewResultCommand command, List<UUID> sourceIds) {
        if (command.result() == null || command.mode() == null) {
            throw new DomainException("VALIDATION_FAILED", "Overview result and mode are required");
        }
        Instant futureLimit = Instant.now().plusSeconds(300);
        if (command.outlineGeneratedAt() != null && command.outlineGeneratedAt().isAfter(futureLimit)
                || command.summaryGeneratedAt() != null && command.summaryGeneratedAt().isAfter(futureLimit)) {
            throw new DomainException("VALIDATION_FAILED", "Overview generatedAt cannot be in the future");
        }
        if (command.mode() == OverviewMode.OUTLINE && command.summaryGeneratedAt() != null
                || command.mode() == OverviewMode.SUMMARY && command.outlineGeneratedAt() != null) {
            throw new DomainException("VALIDATION_FAILED", "generatedAt may only be set for the updated overview part");
        }
        Map<String, String> aliases = new LinkedHashMap<>();
        sourceIds.stream().map(UUID::toString).sorted().forEach(id -> aliases.put(id, id));
        OverviewResponse result = documentValidator.validateProviderDocument(writeJson(command.result()), aliases);
        boolean hasOutline = result.outline() != null && !result.outline().isEmpty();
        boolean hasSummary = result.summary() != null;
        if ((command.mode() == OverviewMode.ALL && (!hasOutline || !hasSummary))
                || (command.mode() == OverviewMode.OUTLINE && !hasOutline)
                || (command.mode() == OverviewMode.SUMMARY && !hasSummary)) {
            throw new DomainException("VALIDATION_FAILED", "Overview seed and requested part must be complete");
        }
        return result;
    }

    private void checkBaseVersion(OverviewResultEntity entity, boolean current, OverviewResultCommand command) {
        if (current) {
            if (entity.getVersion() != command.baseVersion()) {
                throw versionConflict(entity);
            }
            return;
        }
        if (command.baseVersion() != 0 || command.mode() != OverviewMode.ALL) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "A complete ALL overview is required to seed this scope");
        }
    }

    private boolean complete(OverviewResultEntity entity) {
        return entity.getOutline() != null && entity.getSummary() != null;
    }

    private boolean isCurrentSourceResult(UUID userId, OverviewResultEntity entity, SourceView source) {
        return complete(entity) && Objects.equals(entity.getIngestionRevision(), source.ingestionRevision())
                && isCurrentPart(userId, entity, true, List.of(), source)
                && isCurrentPart(userId, entity, false, List.of(), source);
    }

    private boolean isCurrentSubjectResult(UUID userId, OverviewResultEntity entity,
                                          List<OverviewSourceManifestEntry> allInputs) {
        if (!complete(entity) || allInputs == null || exceeds(overviewLimits.maxSources(), allInputs.size())) return false;
        return isCurrentPart(userId, entity, true, allInputs, null)
                && isCurrentPart(userId, entity, false, allInputs, null);
    }

    private boolean isCurrentPart(UUID userId, OverviewResultEntity entity, boolean outline,
                                  List<OverviewSourceManifestEntry> allInputs, SourceView source) {
        String origin = outline ? entity.getOutlineInputOrigin() : entity.getSummaryInputOrigin();
        if (origin == null) return false;
        OverviewInputDescriptor.Origin parsed;
        try { parsed = OverviewInputDescriptor.Origin.valueOf(origin); }
        catch (IllegalArgumentException invalid) { return false; }
        return switch (parsed) {
            case SOURCE_REVISION -> source != null
                    && Objects.equals(entity.getIngestionRevision(), source.ingestionRevision())
                    && Objects.equals(entity.getScopeId(), source.id());
            case SOURCE_OVERVIEW_PARTS -> source == null
                    && isCurrentOverviewPart(entity, allInputs, outline ? OverviewMode.OUTLINE : OverviewMode.SUMMARY, outline);
            case SOURCE_CONTENT -> isCurrentRawContentPart(userId, entity, outline,
                    source == null ? SUBJECT_SCOPE : SOURCE_SCOPE,
                    source == null ? entity.getScopeId() : source.id());
        };
    }

    private boolean isCurrentOverviewPart(OverviewResultEntity entity, List<OverviewSourceManifestEntry> allInputs,
                                         OverviewMode mode, boolean outline) {
        if (!modeInputsAvailable(allInputs, mode)) return false;
        List<OverviewSourceManifestEntry> expected = projectedManifest(allInputs, mode);
        return Objects.equals(outline ? entity.getOutlineSourceManifest() : entity.getSummarySourceManifest(), writeJson(expected))
                && Objects.equals(outline ? entity.getOutlineInputFingerprint() : entity.getSummaryInputFingerprint(),
                subjectFingerprint(allInputs, mode));
    }

    private boolean isCurrentRawContentPart(UUID userId, OverviewResultEntity entity, boolean outline,
                                            String scopeType, UUID scopeId) {
        OverviewInputDescriptor stored = readInputDescriptor(entity, outline);
        if (stored == null || stored.origin() != OverviewInputDescriptor.Origin.SOURCE_CONTENT
                || !scopeType.equals(stored.scopeType()) || !scopeId.equals(stored.scopeId())
                || generationService == null) return false;
        try {
            OverviewJobDtos.Scope scope = OverviewJobDtos.Scope.valueOf(scopeType);
            OverviewInputDescriptor current = generationService.currentRawInputDescriptor(userId, scope, scopeId,
                    stored.sourceIds());
            return stored.equals(current);
        } catch (RuntimeException stale) {
            return false;
        }
    }

    private OverviewInputDescriptor readInputDescriptor(OverviewResultEntity entity, boolean outline) {
        String originValue = outline ? entity.getOutlineInputOrigin() : entity.getSummaryInputOrigin();
        if (originValue == null) return null;
        OverviewInputDescriptor.Origin origin;
        try { origin = OverviewInputDescriptor.Origin.valueOf(originValue); }
        catch (IllegalArgumentException invalid) { return null; }
        if (origin == OverviewInputDescriptor.Origin.SOURCE_CONTENT) {
            String json = outline ? entity.getOutlineInputSnapshotJson() : entity.getSummaryInputSnapshotJson();
            if (json == null || exceeds(overviewLimits.maxInputSnapshotChars(), json.length())) return null;
            try {
                OverviewInputDescriptor stored = objectMapper.readValue(json, OverviewInputDescriptor.class);
                return stored.origin() == origin ? stored : null;
            } catch (JacksonException invalid) { return null; }
        }
        String scopeType = entity.getScopeType();
        UUID scopeId = entity.getScopeId();
        if (origin == OverviewInputDescriptor.Origin.SOURCE_REVISION) {
            if (!SOURCE_SCOPE.equals(scopeType) || entity.getIngestionRevision() == null) return null;
            List<OverviewInputDescriptor.SourceRevision> revisions = List.of(
                    new OverviewInputDescriptor.SourceRevision(scopeId, entity.getIngestionRevision()));
            return new OverviewInputDescriptor(origin, scopeType, scopeId, List.of(scopeId), revisions, List.of(), List.of(),
                    sourceRevisionFingerprint(scopeId, entity.getIngestionRevision()));
        }
        if (!SUBJECT_SCOPE.equals(scopeType)) return null;
        List<OverviewSourceManifestEntry> parts = readManifest(outline
                ? entity.getOutlineSourceManifest() : entity.getSummarySourceManifest());
        List<UUID> sourceIds = parts.stream().map(OverviewSourceManifestEntry::sourceId).toList();
        List<OverviewInputDescriptor.SourceRevision> revisions = parts.stream()
                .map(entry -> new OverviewInputDescriptor.SourceRevision(entry.sourceId(), entry.ingestionRevision())).toList();
        return new OverviewInputDescriptor(origin, scopeType, scopeId, sourceIds, revisions, List.of(), parts,
                outline ? entity.getOutlineInputFingerprint() : entity.getSummaryInputFingerprint());
    }

    private String sourceRevisionFingerprint(UUID sourceId, UUID revision) {
        return sha256("AURALIS-SOURCE-REVISION-V1\n" + lower(sourceId) + "\n" + lower(revision));
    }

    @Transactional
    public OverviewJobRepository.PublicationBaseline capturePublicationBaseline(UUID userId, String scopeType, UUID scopeId) {
        OverviewResultEntity entity;
        boolean current;
        if (SOURCE_SCOPE.equals(scopeType)) {
            SourceView source = requireReadySource(userId, scopeId, null);
            entity = resultRepository.findByUserIdAndScopeTypeAndScopeId(userId, SOURCE_SCOPE, scopeId).orElse(null);
            current = entity != null && isCurrentSourceResult(userId, entity, source);
        } else if (SUBJECT_SCOPE.equals(scopeType)) {
            subjectService.requireActiveSubjectForMutation(userId, scopeId);
            List<OverviewSourceManifestEntry> currentInputs = currentSubjectManifest(userId, scopeId);
            entity = resultRepository.findByUserIdAndScopeTypeAndScopeId(userId, SUBJECT_SCOPE, scopeId).orElse(null);
            current = entity != null && isCurrentSubjectResult(userId, entity, currentInputs);
        } else throw new DomainException("VALIDATION_FAILED", "Overview publication scope is invalid");
        return new OverviewJobRepository.PublicationBaseline(current ? entity.getVersion() : 0,
                entity == null ? null : entity.getId(), entity == null ? null : entity.getVersion());
    }

    private List<OverviewSourceManifestEntry> currentSubjectManifest(UUID userId, UUID subjectId) {
        List<SourceView> sources = sourceService.readyOverviewSources(userId, subjectId).stream()
                .filter(source -> source.type() == SourceType.FILE)
                .toList();
        if (exceeds(overviewLimits.maxSources(), sources.size())) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview source count exceeds its configured limit");
        }
        List<OverviewSourceManifestEntry> entries = new ArrayList<>(sources.size());
        for (SourceView source : sources) {
            OverviewResultEntity sourceOverview = resultRepository.findByUserIdAndScopeTypeAndScopeId(
                    userId, SOURCE_SCOPE, source.id()).orElse(null);
            boolean current = sourceOverview != null && complete(sourceOverview)
                    && Objects.equals(sourceOverview.getIngestionRevision(), source.ingestionRevision());
            Long outlineVersion = current && sourceOverview.getOutline() != null && sourceOverview.getOutlineVersion() > 0
                    ? sourceOverview.getOutlineVersion() : null;
            Long summaryVersion = current && sourceOverview.getSummary() != null && sourceOverview.getSummaryVersion() > 0
                    ? sourceOverview.getSummaryVersion() : null;
            entries.add(new OverviewSourceManifestEntry(source.id(), source.ingestionRevision(), outlineVersion, summaryVersion));
        }
        return sortedManifest(entries);
    }

    private Map<UUID, UUID> sourceRevisionMap(List<OverviewSourceManifestEntry> entries) {
        Map<UUID, UUID> revisions = new LinkedHashMap<>();
        for (OverviewSourceManifestEntry entry : entries) {
            revisions.put(entry.sourceId(), entry.ingestionRevision());
        }
        return Map.copyOf(revisions);
    }

    private List<OverviewSourceManifestEntry> projectedManifest(List<OverviewSourceManifestEntry> entries, OverviewMode mode) {
        return sortedManifest(entries).stream().map(entry -> new OverviewSourceManifestEntry(
                entry.sourceId(), entry.ingestionRevision(),
                mode == OverviewMode.SUMMARY ? null : entry.outlineVersion(),
                mode == OverviewMode.OUTLINE ? null : entry.summaryVersion())).toList();
    }

    private void requireModeInputsAvailable(List<OverviewSourceManifestEntry> allInputs, OverviewMode mode) {
        if (!modeInputsAvailable(allInputs, mode)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Each source must have current overview parts for this mode");
        }
    }

    private boolean modeInputsAvailable(List<OverviewSourceManifestEntry> allInputs, OverviewMode mode) {
        if (allInputs.isEmpty()) return false;
        return allInputs.stream().allMatch(entry ->
                (mode == OverviewMode.SUMMARY || entry.outlineVersion() != null && entry.outlineVersion() > 0)
                        && (mode == OverviewMode.OUTLINE || entry.summaryVersion() != null && entry.summaryVersion() > 0));
    }

    private String subjectFingerprint(List<OverviewSourceManifestEntry> entries, OverviewMode mode) {
        StringBuilder canonical = new StringBuilder("AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1\n");
        for (OverviewSourceManifestEntry entry : projectedManifest(entries, mode)) {
            canonical.append(lower(entry.sourceId())).append('\t')
                    .append(lower(entry.ingestionRevision())).append('\t')
                    .append(entry.outlineVersion() == null ? "-" : entry.outlineVersion()).append('\t')
                    .append(entry.summaryVersion() == null ? "-" : entry.summaryVersion()).append('\n');
        }
        return sha256(canonical.toString());
    }

    private List<OverviewSourceManifestEntry> sortedManifest(List<OverviewSourceManifestEntry> entries) {
        if (entries == null) return List.of();
        List<OverviewSourceManifestEntry> sorted = entries.stream()
                .sorted(Comparator.comparing(entry -> lower(entry.sourceId())))
                .toList();
        if (sorted.stream().map(OverviewSourceManifestEntry::sourceId).distinct().count() != sorted.size()) {
            throw new DomainException("VALIDATION_FAILED", "Overview source manifest contains duplicate sources");
        }
        return sorted;
    }

    private OverviewResultView replay(UUID userId, String scopeType, UUID scopeId,
                                      OverviewResultCommand command, String requestHash) {
        OverviewWriteReceiptEntity receipt = receiptRepository.findByUserIdAndClientWriteId(
                userId, command.clientWriteId()).orElse(null);
        if (receipt == null) return null;
        if (!scopeType.equals(receipt.getScopeType()) || !scopeId.equals(receipt.getScopeId())
                || receipt.getBaseVersion() != command.baseVersion()
                || !requestHash.equals(receipt.getPayloadHash())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview clientWriteId was already used with a different payload");
        }
        try {
            JsonNode snapshot = objectMapper.readTree(receipt.getResponseSnapshot());
            if (snapshot.path("revoked").asBoolean(false)) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview write receipt was revoked with its source");
            }
            if (snapshot instanceof ObjectNode object) {
                if (!object.has("identityReady")) object.put("identityReady", false);
                if (!object.has("outlineIdentity")) object.putNull("outlineIdentity");
                if (!object.has("outlineProvenance")) object.putNull("outlineProvenance");
            }
            return objectMapper.treeToValue(snapshot, OverviewResultView.class);
        } catch (DomainException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new DomainException("INTERNAL_ERROR", "Overview write receipt could not be read", null, exception);
        }
    }

    private void saveReceipt(UUID userId, String scopeType, UUID scopeId, OverviewResultCommand command,
                             String requestHash, OverviewResultView response) {
        receiptRepository.saveAndFlush(new OverviewWriteReceiptEntity(UUID.randomUUID(), userId,
                command.clientWriteId(), scopeType, scopeId, command.baseVersion(), requestHash, writeJson(response)));
    }

    private String payloadHash(String scopeType, UUID scopeId, OverviewResultCommand command,
                               List<OverviewSourceManifestEntry> normalizedManifest) {
        return sha256(writeJson(new ReceiptPayload(scopeType, scopeId, command.baseVersion(), command.clientWriteId(),
                command.mode(), command.ingestionRevision(), normalizedManifest == null
                ? sortedManifest(command.sourceManifest()) : normalizedManifest,
                command.inputFingerprint(), command.outlineGeneratedAt(), command.summaryGeneratedAt(), command.result(),
                command.outlineIdentity(), command.outlineProvenance(), command.inputDescriptor(), command.candidateInput())));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Overview data could not be encoded", null, exception);
        }
    }

    private String writeInputSnapshot(OverviewInputDescriptor input) {
        String json = writeJson(input);
        if (exceeds(overviewLimits.maxInputSnapshotChars(), json.length())) {
            throw new DomainException("VALIDATION_FAILED", "Overview raw input snapshot exceeds its configured limit");
        }
        return json;
    }

    private String writeSourceManifest(List<OverviewSourceManifestEntry> manifest) {
        String json = writeJson(manifest);
        if (exceeds(overviewLimits.maxSourceManifestChars(), json.length())) {
            throw new DomainException("VALIDATION_FAILED", "Overview source manifest exceeds its configured size limit");
        }
        return json;
    }

    private static boolean exceeds(long maximum, long actual) {
        return maximum > 0 && actual > maximum;
    }

    private List<OverviewSourceManifestEntry> readManifest(String value) {
        if (value == null || value.isBlank()) return List.of();
        if (exceeds(overviewLimits.maxSourceManifestChars(), value.length())) {
            throw new DomainException("INTERNAL_ERROR", "Stored overview source manifest exceeds its configured size limit");
        }
        try {
            return objectMapper.readValue(value, new TypeReference<>() { });
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored overview source manifest could not be read", null, exception);
        }
    }

    private OverviewResultView view(OverviewResultEntity entity) {
        return view(entity, entity.getSubjectId());
    }

    private OverviewResultView view(OverviewResultEntity entity, UUID subjectId) {
        List<OverviewChapter> outline = null;
        OverviewSummary summary = null;
        OutlineIdentityView identity = null;
        try {
            if (entity.getOutline() != null) outline = objectMapper.readValue(entity.getOutline(), new TypeReference<>() { });
            if (entity.getSummary() != null) summary = objectMapper.readValue(entity.getSummary(), OverviewSummary.class);
            identity = overviewIdentityService.parseIdentity(entity.getOutlineIdentityJson());
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored overview result could not be read", null, exception);
        }
        return new OverviewResultView(entity.getId(), entity.getScopeType(), entity.getSourceId(), subjectId,
                entity.getIngestionRevision(), entity.getVersion(), entity.getOutlineVersion(), entity.getSummaryVersion(),
                entity.getSchemaVersion(), entity.getTitle(), outline, summary,
                readManifest(entity.getOutlineSourceManifest()), readManifest(entity.getSummarySourceManifest()),
                entity.getOutlineInputFingerprint(), entity.getSummaryInputFingerprint(),
                entity.getOutlineGeneratedAt(), entity.getSummaryGeneratedAt(), entity.getUpdatedAt(),
                identity != null, identity, overviewIdentityService.provenanceView(identity, outline),
                entity.getOutline() == null ? null : readInputDescriptor(entity, true),
                entity.getSummary() == null ? null : readInputDescriptor(entity, false));
    }

    private OverviewResultView withSubjectId(OverviewResultView result, UUID subjectId) {
        return new OverviewResultView(result.id(), result.scopeType(), result.sourceId(), subjectId,
                result.ingestionRevision(), result.version(), result.outlineVersion(), result.summaryVersion(),
                result.schemaVersion(), result.title(), result.outline(), result.summary(),
                result.outlineSourceManifest(), result.summarySourceManifest(),
                result.outlineInputFingerprint(), result.summaryInputFingerprint(),
                result.outlineGeneratedAt(), result.summaryGeneratedAt(), result.updatedAt(),
                result.identityReady(), result.outlineIdentity(), result.outlineProvenance(),
                result.outlineInputDescriptor(), result.summaryInputDescriptor());
    }

    private Instant generatedAt(Instant supplied, boolean updatePart) {
        return updatePart ? (supplied == null ? Instant.now() : supplied) : null;
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) hex.append(String.format("%02x", item));
            return hex.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String lower(UUID value) {
        return value.toString().toLowerCase(java.util.Locale.ROOT);
    }

    private DomainException versionConflict(OverviewResultEntity entity) {
        return new DomainException("RESOURCE_VERSION_CONFLICT", "Overview version does not match", view(entity));
    }

    private DomainException notFound(String detail) {
        return new DomainException("RESOURCE_NOT_FOUND", detail);
    }

    private record ReceiptPayload(String scopeType, UUID scopeId, long baseVersion, UUID clientWriteId,
                                  OverviewMode mode, UUID ingestionRevision,
                                  List<OverviewSourceManifestEntry> sourceManifest,
                                  String inputFingerprint, Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                                  OverviewResponse result,
                                  @JsonInclude(JsonInclude.Include.NON_NULL) OutlineIdentityInput outlineIdentity,
                                  @JsonInclude(JsonInclude.Include.NON_NULL) OutlineProvenanceInput outlineProvenance,
                                   @JsonInclude(JsonInclude.Include.NON_NULL) OverviewInputDescriptor inputDescriptor,
                                   @JsonInclude(JsonInclude.Include.NON_NULL) OverviewResultCommand.CandidateInput candidateInput) {
    }
}
