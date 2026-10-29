package com.auralis.app.source;

import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectLockCoordinator;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import com.auralis.app.source.ParsedDocumentStatus;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

@Service
public class SourceService {

    private static final Logger log = LoggerFactory.getLogger(SourceService.class);

    private final SourceRepository sourceRepository;
    private final AssetRepository assetRepository;
    private final SubjectLockCoordinator subjectLockCoordinator;
    private final ApplicationEventPublisher eventPublisher;
    private final ParsedDocumentRepository parsedDocumentRepository;
    private final ParsedDocumentIngestionPort ingestionJobService;

    public SourceService(
            SourceRepository sourceRepository,
            AssetRepository assetRepository,
            SubjectLockCoordinator subjectLockCoordinator,
            ApplicationEventPublisher eventPublisher,
            ParsedDocumentRepository parsedDocumentRepository,
            ParsedDocumentIngestionPort ingestionJobService) {
        this.sourceRepository = sourceRepository;
        this.assetRepository = assetRepository;
        this.subjectLockCoordinator = subjectLockCoordinator;
        this.eventPublisher = eventPublisher;
        this.parsedDocumentRepository = parsedDocumentRepository;
        this.ingestionJobService = ingestionJobService;
    }

    @Transactional
    public SourceView create(UUID userId, SourceCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView create(UUID userId, UUID sourceId, SourceCommand command) {
        subjectLockCoordinator.lockSubjects(userId, List.of(command.subjectId()));
        ValidatedSource data = validate(userId, command);
        SourceIngestionStatus initialStatus = data.type() == SourceType.FILE
                ? SourceIngestionStatus.AWAITING_CLIENT
                : SourceIngestionStatus.PENDING;
        SourceEntity entity = sourceRepository.saveAndFlush(new SourceEntity(
                sourceId, userId, data.type(), command.subjectId(), requiredTitle(command.title()),
                data.assetId(), data.originUrl(), data.rawText(), command.outline(), initialStatus));
        SourceView result = view(entity);
        enqueueServerOwnedIngestionJob(userId, result);
        publishChange(userId, result, "CREATE");
        log.info("SOURCE_CREATED userId={} sourceId={} type={} subjectId={} assetId={}",
                userId, result.id(), result.type(), result.subjectId(), result.assetId());
        return result;
    }

    @Transactional(readOnly = true)
    public List<SourceView> list(UUID userId) {
        return views(sourceRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId));
    }

    @Transactional(readOnly = true)
    public CursorPage<SourceView> list(UUID userId, String encodedCursor, int requestedLimit) {
        int limit = pageLimit(requestedLimit);
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode("sources", encodedCursor);
        var rows = cursor == null
                ? sourceRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(
                        userId, PageRequest.of(0, limit + 1))
                : sourceRepository.findPageAfter(
                        userId, cursor.updatedAt(), cursor.id(), PageRequest.of(0, limit + 1));
        boolean hasMore = rows.size() > limit;
        var page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode("sources", "", page.getLast().getUpdatedAt(), page.getLast().getId())
                : null;
        return new CursorPage<>(views(page), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<SourceView> listIncludingDeleted(UUID userId) {
        return views(sourceRepository.findAllByUserIdOrderByUpdatedAtDescIdAsc(userId));
    }

    @Transactional(readOnly = true)
    public List<SourceView> findActiveViewsByIds(UUID userId, Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return views(sourceRepository.findAllByUserIdAndIdInAndDeletedAtIsNull(userId, ids));
    }

    /** Active ready Sources available as inputs to a Subject overview manifest. */
    @Transactional(readOnly = true)
    public List<SourceView> readyOverviewSources(UUID userId, UUID subjectId) {
        return sourceRepository.findAllByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(userId, subjectId).stream()
                .filter(source -> source.getIngestionStatus() == SourceIngestionStatus.READY
                        && source.getIngestionRevision() != null)
                .map(this::view)
                .toList();
    }

    @Transactional(readOnly = true)
    public SourceView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional(readOnly = true)
    public SourceView requireActiveSource(UUID userId, UUID id) {
        return get(userId, id);
    }

    /**
     * Locks all owner-scoped source rows in stable ID order and validates their
     * current lifecycle/revision inside the caller's transaction. This is used
     * by Chat terminal persistence so a concurrent delete, reingest, or failed
     * ingestion cannot race the final publication decision.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean lockAndCheckReadyRevisions(UUID userId, Map<UUID, UUID> expectedRevisions) {
        if (expectedRevisions == null) return false;
        if (expectedRevisions.isEmpty()) return true;
        if (expectedRevisions.entrySet().stream()
                .anyMatch(entry -> entry.getKey() == null || entry.getValue() == null)) return false;

        boolean current = true;
        for (Map.Entry<UUID, UUID> entry : expectedRevisions.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.naturalOrder())).toList()) {
            SourceEntity source = sourceRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(
                    entry.getKey(), userId).orElse(null);
            if (source == null || source.getIngestionStatus() != SourceIngestionStatus.READY
                    || !Objects.equals(entry.getValue(), source.getIngestionRevision())) {
                current = false;
            }
        }
        return current;
    }

    @Transactional
    public SourceView requireActiveSourceForMutation(UUID userId, UUID id) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        return view(activeForUpdate(userId, id));
    }

    /**
     * Revalidates and locks a Source after the caller has already acquired its
     * complete Subject lock set. This overload must not acquire another Subject
     * lock, otherwise a move can introduce a reverse lock order.
     */
    public SourceView requireActiveSourceForMutation(UUID userId, UUID id, UUID expectedSubjectId) {
        SourceEntity source = activeForUpdate(userId, id);
        if (!expectedSubjectId.equals(source.getSubjectId())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Source subject changed while being validated");
        }
        return view(source);
    }

    @Transactional(readOnly = true)
    public UUID ownerSubjectIdForMutation(UUID userId, UUID id) {
        return sourceRepository.findSubjectIdByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView update(UUID userId, UUID id, long baseVersion, SourceCommand command) {
        UUID currentSubjectId = ownerSubjectIdForMutation(userId, id);
        List<UUID> ownerSubjectIds = new ArrayList<>();
        ownerSubjectIds.add(currentSubjectId);
        ownerSubjectIds.add(command.subjectId());
        subjectLockCoordinator.lockSubjects(userId, ownerSubjectIds);
        SourceEntity entity = activeForUpdate(userId, id);
        if (!entity.getSubjectId().equals(currentSubjectId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Source subject changed while being updated");
        }
        requireVersion(entity, baseVersion);
        ValidatedSource data = validate(userId, command);
        SourceType previousType = entity.getType();
        UUID previousAssetId = entity.getAssetId();
        boolean typeChanged = previousType != data.type();
        boolean fileAssetChanged = data.type() == SourceType.FILE
                && !Objects.equals(previousAssetId, data.assetId());
        boolean ingestionInputChanged = typeChanged || switch (data.type()) {
            case FILE -> fileAssetChanged;
            case TEXT -> !Objects.equals(entity.getRawText(), data.rawText());
            case URL -> !Objects.equals(entity.getOriginUrl(), data.originUrl());
        };
        boolean requiresClientParsing = data.type() == SourceType.FILE
                && (typeChanged || fileAssetChanged);
        if (requiresClientParsing) {
            supersedeParsedDocuments(userId, id, entity.getIngestionRevision());
        }
        SourceIngestionStatus nextStatus = data.type() == SourceType.FILE
                ? (requiresClientParsing ? SourceIngestionStatus.AWAITING_CLIENT : entity.getIngestionStatus())
                : SourceIngestionStatus.PENDING;
        entity.update(
                data.type(), command.subjectId(), requiredTitle(command.title()), data.assetId(),
                data.originUrl(), data.rawText(), command.outline(), nextStatus,
                ingestionInputChanged);
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        enqueueServerOwnedIngestionJob(userId, result);
        publishChange(userId, result, "UPDATE");
        return result;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        SourceEntity entity = activeForUpdate(userId, id);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        sourceRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
        eventPublisher.publishEvent(new ResourceDeletedEvent(userId, ResourceType.SOURCE, id));
    }

    @EventListener
    @Transactional
    public void onSubjectDeleted(ResourceDeletedEvent event) {
        if (event.resourceType() != ResourceType.SUBJECT) {
            return;
        }
        sourceRepository.findAllForUpdateByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
                        event.userId(), event.resourceId())
                .forEach(source -> {
                    source.softDelete();
                    SourceView result = view(sourceRepository.saveAndFlush(source));
                    publishChange(event.userId(), result, "DELETE");
                    eventPublisher.publishEvent(new ResourceDeletedEvent(
                            event.userId(), ResourceType.SOURCE, source.getId()));
                });
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView restore(UUID userId, UUID id, long baseVersion) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        SourceEntity entity = sourceRepository.findForUpdateByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        if (!entity.getSubjectId().equals(subjectId)) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Source subject changed while being restored");
        }
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Source is not deleted");
        }
        requireVersion(entity, baseVersion);
        if (entity.getType() == SourceType.FILE) {
            requireReadyAsset(userId, entity.getAssetId());
        }
        entity.restore();
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        SourceIngestionStatus ingestionStatus = entity.getIngestionStatus();
        if (entity.getType() != SourceType.FILE
                && (ingestionStatus == SourceIngestionStatus.PENDING
                        || ingestionStatus == SourceIngestionStatus.PARSING
                        || ingestionStatus == SourceIngestionStatus.INDEXING)) {
            ingestionJobService.enqueueServerOwnedSource(userId, id, entity.getIngestionRevision());
        }
        publishChange(userId, result, "RESTORE");
        return result;
    }

    @Transactional
    public SourceView reingest(UUID userId, UUID id, long baseVersion) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        SourceEntity entity = activeForUpdate(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        if (entity.getType() == SourceType.FILE) {
            var accepted = parsedDocumentRepository.findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatus(
                    userId, id, entity.getIngestionRevision(), ParsedDocumentStatus.ACCEPTED);
            if (accepted.isPresent()) {
                entity.requestAcceptedReingest();
                SourceView result = view(sourceRepository.saveAndFlush(entity));
                ingestionJobService.enqueueParsedDocument(
                        userId, id, accepted.get().getId(), entity.getIngestionRevision(), accepted.get().getGeneration());
                publishChange(userId, result, "UPDATE");
                return result;
            }
            supersedeParsedDocuments(userId, id, entity.getIngestionRevision());
        }
        boolean requiresClientParsing = entity.getType() == SourceType.FILE;
        entity.requestReingest(requiresClientParsing);
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        enqueueServerOwnedIngestionJob(userId, result);
        publishChange(userId, result, "UPDATE");
        return result;
    }

    @Transactional
    public SourceView markParsing(UUID userId, UUID id) {
        return transitionIngestion(userId, id, SourceEntity::markParsing);
    }

    @Transactional
    public SourceView markPending(UUID userId, UUID id) {
        return transitionIngestion(userId, id, SourceEntity::markPending);
    }

    @Transactional
    public SourceView markIndexing(UUID userId, UUID id) {
        return transitionIngestion(userId, id, SourceEntity::markIndexing);
    }

    @Transactional
    public SourceView markReady(UUID userId, UUID id) {
        return transitionIngestion(userId, id, SourceEntity::markReady);
    }

    @Transactional
    public SourceView markFailed(UUID userId, UUID id, String safeErrorCode, String safeErrorDetail) {
        return transitionIngestion(userId, id, entity -> entity.markFailed(safeErrorCode, safeErrorDetail));
    }

    @Transactional
    public Optional<SourceView> markParsingIfRevision(UUID userId, UUID id, UUID ingestionRevision) {
        return transitionIngestionIfRevision(userId, id, ingestionRevision, SourceEntity::markParsing);
    }

    @Transactional
    public boolean lockIngestionRevision(UUID userId, UUID id, UUID ingestionRevision) {
        SourceEntity entity = lockForIngestion(userId, id);
        return entity != null && Objects.equals(entity.getIngestionRevision(), ingestionRevision);
    }

    @Transactional
    public boolean markIndexingIfRevision(UUID userId, UUID id, UUID ingestionRevision) {
        return transitionIngestionIfRevision(userId, id, ingestionRevision, SourceEntity::markIndexing).isPresent();
    }

    @Transactional
    public boolean markReadyIfRevision(UUID userId, UUID id, UUID ingestionRevision) {
        return transitionIngestionIfRevision(userId, id, ingestionRevision, SourceEntity::markReady).isPresent();
    }

    @Transactional
    public boolean markPendingIfRevision(UUID userId, UUID id, UUID ingestionRevision) {
        return transitionIngestionIfRevision(userId, id, ingestionRevision, SourceEntity::markPending).isPresent();
    }

    @Transactional
    public boolean markFailedIfRevision(
            UUID userId, UUID id, UUID ingestionRevision, String safeErrorCode, String safeErrorDetail) {
        return transitionIngestionIfRevision(
                userId, id, ingestionRevision,
                entity -> entity.markFailed(safeErrorCode, safeErrorDetail)).isPresent();
    }

    private SourceView transitionIngestion(UUID userId, UUID id, Consumer<SourceEntity> transition) {
        UUID subjectId = ownerSubjectIdForMutation(userId, id);
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId));
        SourceEntity entity = activeForUpdate(userId, id);
        requireActive(entity);
        SourceIngestionStatus previousStatus = entity.getIngestionStatus();
        String previousErrorCode = entity.getSafeErrorCode();
        String previousErrorDetail = entity.getSafeErrorDetail();

        transition.accept(entity);

        if (previousStatus == entity.getIngestionStatus()
                && Objects.equals(previousErrorCode, entity.getSafeErrorCode())
                && Objects.equals(previousErrorDetail, entity.getSafeErrorDetail())) {
            return view(entity);
        }
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return result;
    }

    private Optional<SourceView> transitionIngestionIfRevision(
            UUID userId, UUID id, UUID ingestionRevision, Consumer<SourceEntity> transition) {
        SourceEntity entity = lockForIngestion(userId, id);
        if (entity == null || !Objects.equals(entity.getIngestionRevision(), ingestionRevision)) {
            return Optional.empty();
        }
        SourceIngestionStatus previousStatus = entity.getIngestionStatus();
        String previousErrorCode = entity.getSafeErrorCode();
        String previousErrorDetail = entity.getSafeErrorDetail();
        transition.accept(entity);
        if (previousStatus == entity.getIngestionStatus()
                && Objects.equals(previousErrorCode, entity.getSafeErrorCode())
                && Objects.equals(previousErrorDetail, entity.getSafeErrorDetail())) {
            return Optional.of(view(entity));
        }
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        return Optional.of(result);
    }

    private SourceEntity lockForIngestion(UUID userId, UUID id) {
        var subjectId = sourceRepository.findSubjectIdByIdAndUserId(id, userId);
        if (subjectId.isEmpty()) {
            return null;
        }
        subjectLockCoordinator.lockSubjects(userId, List.of(subjectId.get()));
        return sourceRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(id, userId).orElse(null);
    }

    private ValidatedSource validate(UUID userId, SourceCommand command) {
        if (command.type() == null) {
            throw new DomainException("VALIDATION_FAILED", "Source type is required");
        }
        return switch (command.type()) {
            case FILE -> {
                if (command.assetId() == null || command.originUrl() != null || command.rawText() != null) {
                    throw new DomainException("VALIDATION_FAILED", "FILE source requires only a READY asset");
                }
                requireReadyAsset(userId, command.assetId());
                yield new ValidatedSource(SourceType.FILE, command.assetId(), null, null);
            }
            case TEXT -> {
                if (command.assetId() != null || command.originUrl() != null || command.rawText() == null
                        || command.rawText().isBlank()) {
                    throw new DomainException("VALIDATION_FAILED", "TEXT source requires rawText only");
                }
                yield new ValidatedSource(SourceType.TEXT, null, null, command.rawText());
            }
            case URL -> {
                if (command.assetId() != null || command.rawText() != null) {
                    throw new DomainException("VALIDATION_FAILED", "URL source requires originUrl only");
                }
                yield new ValidatedSource(SourceType.URL, null, requiredHttpUrl(command.originUrl()), null);
            }
        };
    }

    private void requireReadyAsset(UUID userId, UUID assetId) {
        AssetEntity asset = assetRepository.findForUpdateByIdAndUserId(assetId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Asset was not found"));
        if (asset.getUploadStatus() != AssetUploadStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Source asset is not ready");
        }
    }

    private String requiredHttpUrl(String value) {
        if (value == null || value.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "originUrl is required");
        }
        try {
            URI uri = new URI(value.trim());
            if (!uri.isAbsolute() || !("http".equalsIgnoreCase(uri.getScheme())
                    || "https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) {
                throw new DomainException("VALIDATION_FAILED", "originUrl must be an HTTP or HTTPS URL");
            }
            return uri.toString();
        } catch (URISyntaxException exception) {
            throw new DomainException("VALIDATION_FAILED", "originUrl is invalid");
        }
    }

    private String requiredTitle(String value) {
        if (value == null || value.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "title is required");
        }
        return value.trim();
    }

    private SourceEntity active(UUID userId, UUID id) {
        return sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
    }

    private SourceEntity activeForUpdate(UUID userId, UUID id) {
        return sourceRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
    }

    private SourceEntity mutable(UUID userId, UUID id) {
        return sourceRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
    }

    private void requireActive(SourceEntity entity) {
        if (entity.getDeletedAt() != null) {
            throw new DomainException("RESOURCE_DELETED", "Source has been deleted");
        }
    }

    private void requireVersion(SourceEntity entity, long baseVersion) {
        if (entity.getVersion() != baseVersion) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Source version does not match", view(entity));
        }
    }

    private SourceView view(SourceEntity entity) {
        Long assetSizeBytes = entity.getAssetId() == null
                ? null
                : assetRepository.findByIdAndUserId(entity.getAssetId(), entity.getUserId())
                        .map(AssetEntity::getSizeBytes)
                        .orElse(null);
        return new SourceView(
                entity.getId(), entity.getSubjectId(), entity.getType(), entity.getTitle(), entity.getAssetId(),
                entity.getOriginUrl(), entity.getRawText(), entity.getOutline(), entity.getIngestionStatus(),
                entity.getIngestionRevision(), entity.getSafeErrorCode(), entity.getSafeErrorDetail(), entity.getVersion(), entity.getCreatedAt(),
                entity.getUpdatedAt(), entity.getDeletedAt(), assetSizeBytes);
    }

    private List<SourceView> views(List<SourceEntity> entities) {
        if (entities.isEmpty()) {
            return List.of();
        }
        List<UUID> assetIds = entities.stream()
                .map(SourceEntity::getAssetId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, Long> assetSizes = assetIds.isEmpty()
                ? Map.of()
                : assetRepository.findAllByUserIdAndIdIn(entities.getFirst().getUserId(), assetIds)
                        .stream()
                        .collect(Collectors.toMap(AssetEntity::getId, AssetEntity::getSizeBytes));
        return entities.stream().map(entity -> view(entity, assetSizes)).toList();
    }

    private SourceView view(SourceEntity entity, Map<UUID, Long> assetSizes) {
        Long assetSizeBytes = entity.getAssetId() == null ? null : assetSizes.get(entity.getAssetId());
        return new SourceView(
                entity.getId(), entity.getSubjectId(), entity.getType(), entity.getTitle(), entity.getAssetId(),
                entity.getOriginUrl(), entity.getRawText(), entity.getOutline(), entity.getIngestionStatus(),
                entity.getIngestionRevision(), entity.getSafeErrorCode(), entity.getSafeErrorDetail(), entity.getVersion(),
                entity.getCreatedAt(), entity.getUpdatedAt(), entity.getDeletedAt(), assetSizeBytes);
    }

    private void enqueueServerOwnedIngestionJob(UUID userId, SourceView view) {
        if (view.type() != SourceType.FILE) {
            // Insert the durable job in the Source transaction so a committed PENDING revision is always recoverable.
            try {
                ingestionJobService.enqueueServerOwnedSource(userId, view.id(), view.ingestionRevision());
            } catch (DomainException exception) {
                // create/update allow domain errors to commit by default; enqueue failure must still roll back Source.
                TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
                throw exception;
            }
        }
    }

    private void supersedeParsedDocuments(UUID userId, UUID sourceId, UUID ingestionRevision) {
        var documents = parsedDocumentRepository.findAllByUserIdAndSourceIdAndIngestionRevision(
                userId, sourceId, ingestionRevision);
        for (var document : documents) {
            if (document.getStatus() == ParsedDocumentStatus.ACCEPTED) {
                document.supersede();
            }
        }
        if (!documents.isEmpty()) {
            parsedDocumentRepository.saveAll(documents);
        }
    }

    private void publishChange(UUID userId, SourceView view, String mutationType) {
        eventPublisher.publishEvent(new ResourceChangedEvent(
                userId, ResourceType.SOURCE, view.id(), mutationType, view.version(), view.deletedAt(), view));
    }

    private int pageLimit(int requestedLimit) {
        if (requestedLimit < 1 || requestedLimit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
        return requestedLimit;
    }

    private record ValidatedSource(SourceType type, UUID assetId, String originUrl, String rawText) {
    }
}
