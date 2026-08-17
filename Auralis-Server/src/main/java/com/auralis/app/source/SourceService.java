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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.UUID;

@Service
public class SourceService {

    private final SourceRepository sourceRepository;
    private final AssetRepository assetRepository;
    private final SubjectService subjectService;
    private final ApplicationEventPublisher eventPublisher;

    public SourceService(
            SourceRepository sourceRepository,
            AssetRepository assetRepository,
            SubjectService subjectService,
            ApplicationEventPublisher eventPublisher) {
        this.sourceRepository = sourceRepository;
        this.assetRepository = assetRepository;
        this.subjectService = subjectService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public SourceView create(UUID userId, SourceCommand command) {
        return create(userId, UUID.randomUUID(), command);
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView create(UUID userId, UUID sourceId, SourceCommand command) {
        subjectService.requireActiveSubject(userId, command.subjectId());
        ValidatedSource data = validate(userId, command);
        SourceView result = view(sourceRepository.save(new SourceEntity(
                sourceId, userId, data.type(), command.subjectId(), requiredTitle(command.title()),
                data.assetId(), data.originUrl(), data.rawText(), command.outline(), SourceIngestionStatus.PENDING)));
        publishChange(userId, result, "CREATE");
        eventPublisher.publishEvent(new SourceIngestionRequestedEvent(userId, result.id(), result.version()));
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

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView update(UUID userId, UUID id, long baseVersion, SourceCommand command) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        subjectService.requireActiveSubject(userId, command.subjectId());
        ValidatedSource data = validate(userId, command);
        entity.update(
                data.type(), command.subjectId(), requiredTitle(command.title()), data.assetId(),
                data.originUrl(), data.rawText(), command.outline());
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        eventPublisher.publishEvent(new SourceIngestionRequestedEvent(userId, result.id(), result.version()));
        return result;
    }

    @Transactional(noRollbackFor = DomainException.class)
    public void delete(UUID userId, UUID id, long baseVersion) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        entity.softDelete();
        sourceRepository.saveAndFlush(entity);
        publishChange(userId, view(entity), "DELETE");
        eventPublisher.publishEvent(new ResourceDeletedEvent(userId, ResourceType.SOURCE, id));
    }

    @Transactional(noRollbackFor = DomainException.class)
    public SourceView restore(UUID userId, UUID id, long baseVersion) {
        SourceEntity entity = mutable(userId, id);
        if (entity.getDeletedAt() == null) {
            throw new DomainException("MUTATION_REJECTED", "Source is not deleted");
        }
        requireVersion(entity, baseVersion);
        subjectService.requireActiveSubject(userId, entity.getSubjectId());
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
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        requireVersion(entity, baseVersion);
        entity.requestReingest();
        SourceView result = view(sourceRepository.saveAndFlush(entity));
        publishChange(userId, result, "UPDATE");
        eventPublisher.publishEvent(new SourceIngestionRequestedEvent(userId, result.id(), result.version()));
        return result;
    }

    @Transactional
    public SourceView markParsing(UUID userId, UUID id) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        entity.markParsing();
        return view(sourceRepository.saveAndFlush(entity));
    }

    @Transactional
    public SourceView markPending(UUID userId, UUID id) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        entity.markPending();
        return view(sourceRepository.saveAndFlush(entity));
    }

    @Transactional
    public SourceView markIndexing(UUID userId, UUID id) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        entity.markIndexing();
        return view(sourceRepository.saveAndFlush(entity));
    }

    @Transactional
    public SourceView markReady(UUID userId, UUID id) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        entity.markReady();
        return view(sourceRepository.saveAndFlush(entity));
    }

    @Transactional
    public SourceView markFailed(UUID userId, UUID id, String safeErrorCode, String safeErrorDetail) {
        SourceEntity entity = mutable(userId, id);
        requireActive(entity);
        entity.markFailed(safeErrorCode, safeErrorDetail);
        return view(sourceRepository.saveAndFlush(entity));
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
        return new SourceView(
                entity.getId(), entity.getSubjectId(), entity.getType(), entity.getTitle(), entity.getAssetId(),
                entity.getOriginUrl(), entity.getRawText(), entity.getOutline(), entity.getIngestionStatus(),
                entity.getSafeErrorCode(), entity.getSafeErrorDetail(), entity.getVersion(), entity.getCreatedAt(),
                entity.getUpdatedAt(), entity.getDeletedAt());
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
