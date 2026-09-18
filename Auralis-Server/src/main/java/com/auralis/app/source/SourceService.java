package com.auralis.app.source;

import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.shared.domain.SourceIngestionRequestedEvent;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectService;
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
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.ArrayList;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;

@Service
public class SourceService {

    private static final Logger log = LoggerFactory.getLogger(SourceService.class);

    private final SourceRepository sourceRepository;
    private final AssetRepository assetRepository;
    private final SubjectService subjectService;
    private final ApplicationEventPublisher eventPublisher;
    private final ParsedDocumentRepository parsedDocumentRepository;
    private final ParsedDocumentIngestionPort ingestionJobService;

    public SourceService(
            SourceRepository sourceRepository,
            AssetRepository assetRepository,
            SubjectService subjectService,
            ApplicationEventPublisher eventPublisher,
            ParsedDocumentRepository parsedDocumentRepository,
            ParsedDocumentIngestionPort ingestionJobService) {
        this.sourceRepository = sourceRepository;
        this.assetRepository = assetRepository;
        this.subjectService = subjectService;
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
        subjectService.requireActiveSubjectForMutation(userId, command.subjectId());
        ValidatedSource data = validate(userId, command);
        SourceIngestionStatus initialStatus = data.type() == SourceType.FILE
                ? SourceIngestionStatus.AWAITING_CLIENT
                : SourceIngestionStatus.PENDING;
        SourceView result = view(sourceRepository.save(new SourceEntity(
                sourceId, userId, data.type(), command.subjectId(), requiredTitle(command.title()),
                data.assetId(), data.originUrl(), data.rawText(), command.outline(), initialStatus)));
        publishChange(userId, result, "CREATE");
        publishIngestionRequestIfServerOwned(userId, result);
        log.info("SOURCE_CREATED userId={} sourceId={} type={} subjectId={} assetId={}",
                userId, result.id(), result.type(), result.subjectId(), result.assetId());
        return result;
    }

    @Transactional(readOnly = true)
    public List<SourceView> list(UUID userId) {
        return sourceRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
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
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public List<SourceView> listIncludingDeleted(UUID userId) {
        return sourceRepository.findAllByUserIdOrderByUpdatedAtDescIdAsc(userId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public SourceView get(UUID userId, UUID id) {
        return view(active(userId, id));
    }

    @Transactional(readOnly = true)
    public SourceView requireActiveSource(UUID userId, UUID id) {
        return get(userId, id);
    }

    @Transactional
    public SourceView requireActiveSourceForMutation(UUID userId, UUID id) {
        SourceEntity candidate = mutable(userId, id);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        return view(active(userId, id));
    }

    @Transactional(readOnly = true)
    public UUID ownerSubjectIdForMutation(UUID userId, UUID id) {
        return mutable(userId, id).getSubjectId();
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView update(UUID userId, UUID id, long baseVersion, SourceCommand command) {
        SourceEntity candidate = mutable(userId, id);
        requireActive(candidate);
        List<UUID> ownerSubjectIds = new ArrayList<>();
        ownerSubjectIds.add(candidate.getSubjectId());
        ownerSubjectIds.add(command.subjectId());
        subjectService.requireActiveSubjectsForMutation(userId, ownerSubjectIds);
        SourceEntity entity = active(userId, id);
        requireVersion(entity, baseVersion);
        ValidatedSource data = validate(userId, command);
        SourceType previousType = entity.getType();
        UUID previousAssetId = entity.getAssetId();
        boolean typeChanged = previousType != data.type();
        boolean fileAssetChanged = data.type() == SourceType.FILE
                && !Objects.equals(previousAssetId, data.assetId());
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
                typeChanged || fileAssetChanged);
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        publishIngestionRequestIfServerOwned(userId, result);
        return result;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        SourceEntity candidate = mutable(userId, id);
        requireActive(candidate);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        SourceEntity entity = active(userId, id);
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
        sourceRepository.findAllByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
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
        SourceEntity candidate = mutable(userId, id);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        SourceEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Source is not deleted");
        }
        requireVersion(entity, baseVersion);
        if (entity.getType() == SourceType.FILE) {
            requireReadyAsset(userId, entity.getAssetId());
        }
        entity.restore();
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        publishChange(userId, result, "RESTORE");
        return result;
    }

    @Transactional
    public SourceView reingest(UUID userId, UUID id, long baseVersion) {
        SourceEntity candidate = mutable(userId, id);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        SourceEntity entity = mutable(userId, id);
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
        publishChange(userId, result, "UPDATE");
        publishIngestionRequestIfServerOwned(userId, result);
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

    private SourceView transitionIngestion(UUID userId, UUID id, Consumer<SourceEntity> transition) {
        SourceEntity candidate = mutable(userId, id);
        subjectService.requireActiveSubjectForMutation(userId, candidate.getSubjectId());
        SourceEntity entity = mutable(userId, id);
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
        AssetEntity asset = assetRepository.findByIdAndUserId(assetId, userId)
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

    private void publishIngestionRequestIfServerOwned(UUID userId, SourceView view) {
        if (view.type() != SourceType.FILE) {
            eventPublisher.publishEvent(new SourceIngestionRequestedEvent(userId, view.id(), view.version()));
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
