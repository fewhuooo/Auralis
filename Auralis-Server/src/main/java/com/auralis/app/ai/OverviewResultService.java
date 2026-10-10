package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.ai.internal.persistence.OverviewResultEntity;
import com.auralis.app.ai.internal.persistence.OverviewResultRepository;
import com.auralis.app.ai.internal.persistence.OverviewWriteReceiptEntity;
import com.auralis.app.ai.internal.persistence.OverviewWriteReceiptRepository;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.domain.OverviewResultChangedEvent;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class OverviewResultService {
    private static final String SOURCE_SCOPE = "SOURCE";
    private static final String SUBJECT_SCOPE = "SUBJECT";
    private static final int MAX_SOURCES = 100;

    private final OverviewResultRepository resultRepository;
    private final OverviewWriteReceiptRepository receiptRepository;
    private final IdentityService identityService;
    private final SourceService sourceService;
    private final SubjectService subjectService;
    private final OverviewDocumentValidator documentValidator;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;

    public OverviewResultService(OverviewResultRepository resultRepository,
                                 OverviewWriteReceiptRepository receiptRepository,
                                 IdentityService identityService,
                                 SourceService sourceService,
                                 SubjectService subjectService,
                                 OverviewDocumentValidator documentValidator,
                                 ObjectMapper objectMapper,
                                 ApplicationEventPublisher eventPublisher) {
        this.resultRepository = resultRepository;
        this.receiptRepository = receiptRepository;
        this.identityService = identityService;
        this.sourceService = sourceService;
        this.subjectService = subjectService;
        this.documentValidator = documentValidator;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public OverviewResultView getSource(UUID userId, UUID sourceId, UUID expectedRevision) {
        SourceView source = requireReadySource(userId, sourceId, null);
        if (expectedRevision != null && !expectedRevision.equals(source.ingestionRevision())) {
            throw notFound("Current source overview was not found for the requested ingestion revision");
        }
        OverviewResultEntity entity = resultRepository.findByUserIdAndScopeTypeAndScopeId(
                        userId, SOURCE_SCOPE, sourceId)
                .filter(value -> Objects.equals(value.getIngestionRevision(), source.ingestionRevision())
                        && complete(value))
                .orElseThrow(() -> notFound("Current source overview was not found"));
        return view(entity, source.subjectId());
    }

    @Transactional(noRollbackFor = DomainException.class)
    public OverviewResultView putSource(UUID userId, UUID sourceId, OverviewResultCommand command) {
        identityService.lockUserForScheduling(userId);
        SourceView source = requireReadySource(userId, sourceId, null);
        validateSourceWrite(source, command);
        OverviewResponse validated = validateResult(command, List.of(sourceId));
        String requestHash = payloadHash(SOURCE_SCOPE, sourceId, command, null);
        OverviewResultView replay = replay(userId, SOURCE_SCOPE, sourceId, command, requestHash);
        if (replay != null) return withSubjectId(replay, source.subjectId());

        OverviewResultEntity entity = resultRepository.findForUpdate(userId, SOURCE_SCOPE, sourceId).orElse(null);
        boolean current = entity != null && Objects.equals(entity.getIngestionRevision(), source.ingestionRevision())
                && complete(entity);
        checkBaseVersion(entity, current, command);
        boolean updateOutline = command.mode() != OverviewMode.SUMMARY;
        boolean updateSummary = command.mode() != OverviewMode.OUTLINE;
        if (entity == null) {
            entity = new OverviewResultEntity(UUID.randomUUID(), userId, SOURCE_SCOPE, sourceId,
                    source.subjectId(), sourceId, source.ingestionRevision());
        }
        entity.apply(validated.title(), validated.schemaVersion(), updateOutline ? writeJson(validated.outline()) : null,
                updateSummary ? writeJson(validated.summary()) : null, null, null, null, null,
                generatedAt(command.outlineGeneratedAt(), updateOutline), generatedAt(command.summaryGeneratedAt(), updateSummary),
                updateOutline, updateSummary, source.ingestionRevision());
        OverviewResultEntity saved = resultRepository.saveAndFlush(entity);
        OverviewResultView response = view(saved, source.subjectId());
        saveReceipt(userId, SOURCE_SCOPE, sourceId, command, requestHash, response);
        eventPublisher.publishEvent(new OverviewResultChangedEvent(userId, SOURCE_SCOPE, sourceId,
                response.version(), response.updatedAt()));
        return response;
    }

    @Transactional
    public OverviewResultView getSubject(UUID userId, UUID subjectId) {
        subjectService.requireActiveSubjectForMutation(userId, subjectId);
        List<OverviewSourceManifestEntry> allInputs = currentSubjectManifest(userId, subjectId);
        OverviewResultEntity entity = resultRepository.findByUserIdAndScopeTypeAndScopeId(
                        userId, SUBJECT_SCOPE, subjectId)
                .filter(value -> isCurrentSubjectResult(value, allInputs))
                .orElseThrow(() -> notFound("Current subject overview was not found"));
        return view(entity);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public OverviewResultView putSubject(UUID userId, UUID subjectId, OverviewResultCommand command) {
        identityService.lockUserForScheduling(userId);
        subjectService.requireActiveSubjectForMutation(userId, subjectId);
        List<OverviewSourceManifestEntry> allInputs = currentSubjectManifest(userId, subjectId);
        List<OverviewSourceManifestEntry> requestManifest = projectedManifest(allInputs, command.mode());
        validateSubjectWrite(command, allInputs, requestManifest);
        OverviewResponse validated = validateResult(command, allInputs.stream()
                .map(OverviewSourceManifestEntry::sourceId).toList());
        String requestHash = payloadHash(SUBJECT_SCOPE, subjectId, command, requestManifest);
        OverviewResultView replay = replay(userId, SUBJECT_SCOPE, subjectId, command, requestHash);
        if (replay != null) return replay;

        OverviewResultEntity entity = resultRepository.findForUpdate(userId, SUBJECT_SCOPE, subjectId).orElse(null);
        boolean current = entity != null && isCurrentSubjectResult(entity, allInputs);
        checkBaseVersion(entity, current, command);
        boolean updateOutline = command.mode() != OverviewMode.SUMMARY;
        boolean updateSummary = command.mode() != OverviewMode.OUTLINE;
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
                updateOutline ? writeJson(outlineManifest) : entity.getOutlineSourceManifest(),
                updateSummary ? writeJson(summaryManifest) : entity.getSummarySourceManifest(),
                outlineFingerprint, summaryFingerprint,
                updateOutline ? generatedAt(command.outlineGeneratedAt(), true) : entity.getOutlineGeneratedAt(),
                updateSummary ? generatedAt(command.summaryGeneratedAt(), true) : entity.getSummaryGeneratedAt(),
                updateOutline, updateSummary, null);
        OverviewResultEntity saved = resultRepository.saveAndFlush(entity);
        OverviewResultView response = view(saved);
        saveReceipt(userId, SUBJECT_SCOPE, subjectId, command, requestHash, response);
        eventPublisher.publishEvent(new OverviewResultChangedEvent(userId, SUBJECT_SCOPE, subjectId,
                response.version(), response.updatedAt()));
        return response;
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

    private void validateSubjectWrite(OverviewResultCommand command, List<OverviewSourceManifestEntry> allInputs,
                                      List<OverviewSourceManifestEntry> requestManifest) {
        if (command.ingestionRevision() != null) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview does not accept an ingestion revision");
        }
        if (requestManifest.isEmpty() || requestManifest.size() > MAX_SOURCES) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview requires one to one hundred READY sources");
        }
        requireModeInputsAvailable(allInputs, command.mode());
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

    private boolean isCurrentSubjectResult(OverviewResultEntity entity, List<OverviewSourceManifestEntry> allInputs) {
        if (!complete(entity) || allInputs.isEmpty() || allInputs.size() > MAX_SOURCES
                || !modeInputsAvailable(allInputs, OverviewMode.ALL)) return false;
        List<OverviewSourceManifestEntry> currentOutline = projectedManifest(allInputs, OverviewMode.OUTLINE);
        List<OverviewSourceManifestEntry> currentSummary = projectedManifest(allInputs, OverviewMode.SUMMARY);
        return Objects.equals(entity.getOutlineSourceManifest(), writeJson(currentOutline))
                && Objects.equals(entity.getSummarySourceManifest(), writeJson(currentSummary))
                && Objects.equals(entity.getOutlineInputFingerprint(), subjectFingerprint(allInputs, OverviewMode.OUTLINE))
                && Objects.equals(entity.getSummaryInputFingerprint(), subjectFingerprint(allInputs, OverviewMode.SUMMARY));
    }

    private List<OverviewSourceManifestEntry> currentSubjectManifest(UUID userId, UUID subjectId) {
        List<SourceView> sources = sourceService.readyOverviewSources(userId, subjectId).stream()
                .filter(source -> source.type() == SourceType.FILE)
                .toList();
        if (sources.size() > MAX_SOURCES) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview supports at most one hundred READY sources");
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
            return objectMapper.readValue(receipt.getResponseSnapshot(), OverviewResultView.class);
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
                command.inputFingerprint(), command.outlineGeneratedAt(), command.summaryGeneratedAt(), command.result())));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Overview data could not be encoded", null, exception);
        }
    }

    private List<OverviewSourceManifestEntry> readManifest(String value) {
        if (value == null || value.isBlank()) return List.of();
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
        try {
            if (entity.getOutline() != null) outline = objectMapper.readValue(entity.getOutline(), new TypeReference<>() { });
            if (entity.getSummary() != null) summary = objectMapper.readValue(entity.getSummary(), OverviewSummary.class);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Stored overview result could not be read", null, exception);
        }
        return new OverviewResultView(entity.getId(), entity.getScopeType(), entity.getSourceId(), subjectId,
                entity.getIngestionRevision(), entity.getVersion(), entity.getOutlineVersion(), entity.getSummaryVersion(),
                entity.getSchemaVersion(), entity.getTitle(), outline, summary,
                readManifest(entity.getOutlineSourceManifest()), readManifest(entity.getSummarySourceManifest()),
                entity.getOutlineInputFingerprint(), entity.getSummaryInputFingerprint(),
                entity.getOutlineGeneratedAt(), entity.getSummaryGeneratedAt(), entity.getUpdatedAt());
    }

    private OverviewResultView withSubjectId(OverviewResultView result, UUID subjectId) {
        return new OverviewResultView(result.id(), result.scopeType(), result.sourceId(), subjectId,
                result.ingestionRevision(), result.version(), result.outlineVersion(), result.summaryVersion(),
                result.schemaVersion(), result.title(), result.outline(), result.summary(),
                result.outlineSourceManifest(), result.summarySourceManifest(),
                result.outlineInputFingerprint(), result.summaryInputFingerprint(),
                result.outlineGeneratedAt(), result.summaryGeneratedAt(), result.updatedAt());
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
                                  OverviewResponse result) {
    }
}
