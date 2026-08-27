package com.auralis.app.source;

import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Service
public class ParsedDocumentService {

    private static final String PARSED_DOCUMENT_MIME = "application/gzip";

    private final SourceRepository sourceRepository;
    private final ParsedDocumentRepository parsedDocumentRepository;
    private final AssetStoragePort assetStorage;
    private final AuralisProperties properties;
    private final AssetService assetService;
    private final ParsedDocumentValidator validator;
    private final IngestionJobService ingestionJobService;

    public ParsedDocumentService(
            SourceRepository sourceRepository,
            ParsedDocumentRepository parsedDocumentRepository,
            AssetStoragePort assetStorage,
            AuralisProperties properties,
            AssetService assetService,
            ParsedDocumentValidator validator,
            IngestionJobService ingestionJobService) {
        this.sourceRepository = sourceRepository;
        this.parsedDocumentRepository = parsedDocumentRepository;
        this.assetStorage = assetStorage;
        this.properties = properties;
        this.assetService = assetService;
        this.validator = validator;
        this.ingestionJobService = ingestionJobService;
    }

    @Transactional
    public ParsedDocumentUploadIntentView createUploadIntent(
            UUID userId, UUID sourceId, ParsedDocumentUploadCommand command) {
        SourceEntity source = sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        if (source.getType() != SourceType.FILE) {
            throw new DomainException("MUTATION_REJECTED", "Parsed documents are only valid for FILE sources");
        }
        if (!source.getIngestionRevision().equals(command.ingestionRevision())) {
            throw new DomainException("MUTATION_REJECTED", "Ingestion revision does not match the current source");
        }
        if (command.schemaVersion() != 1) {
            throw new DomainException("VALIDATION_FAILED", "schemaVersion must be 1");
        }
        if (command.sizeBytes() <= 0 || command.sizeBytes() > properties.upload().maxFileSizeBytes()) {
            throw new DomainException("UPLOAD_VALIDATION_FAILED", "Parsed document size is outside the allowed range");
        }

        UUID parsedDocumentId = UUID.randomUUID();
        String objectKey = "users/" + userId
                + "/sources/" + sourceId
                + "/revisions/" + command.ingestionRevision()
                + "/parsed-documents/" + parsedDocumentId;
        AssetStoragePort.UploadIntent intent = assetStorage.createUploadIntent(
                objectKey, PARSED_DOCUMENT_MIME, command.sizeBytes(), command.payloadSha256());
        parsedDocumentRepository.save(new ParsedDocumentEntity(
                parsedDocumentId, userId, sourceId, command.ingestionRevision(), command.schemaVersion(),
                normalizeRequired(command.parserId()), normalizeRequired(command.parserVersion()),
                normalizeRequired(command.normalizationVersion()), normalizeOptional(command.ocrModelVersion()),
                normalizeHash(command.sourceAssetSha256()), normalizeHash(command.payloadSha256()),
                command.sizeBytes(), objectKey));
        return new ParsedDocumentUploadIntentView(
                parsedDocumentId, command.ingestionRevision(), intent.url(), intent.headers(), intent.expiresAt());
    }

    @Transactional(noRollbackFor = DomainException.class)
    public ParsedDocumentCompleteView complete(UUID userId, UUID sourceId, UUID parsedDocumentId) {
        SourceEntity source = sourceRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        ParsedDocumentEntity document = parsedDocumentRepository.findByIdAndUserId(parsedDocumentId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Parsed document was not found"));
        if (!Objects.equals(document.getSourceId(), sourceId)) {
            throw new DomainException("RESOURCE_NOT_FOUND", "Parsed document was not found");
        }
        if (!Objects.equals(document.getIngestionRevision(), source.getIngestionRevision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Parsed document revision is no longer current");
        }

        ParsedDocumentEntity winner = parsedDocumentRepository
                .findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatus(
                        userId, sourceId, source.getIngestionRevision(), ParsedDocumentStatus.ACCEPTED)
                .orElse(null);
        if (winner != null) {
            if (winner.getId().equals(document.getId())) {
                IngestionJobEntity job = ingestionJobService.findParsedDocumentJob(
                        userId, sourceId, source.getIngestionRevision()).orElse(null);
                return view(winner, job);
            }
            if (winner.getPayloadSha256().equalsIgnoreCase(document.getPayloadSha256())) {
                document.supersede();
                parsedDocumentRepository.saveAndFlush(document);
                IngestionJobEntity job = ingestionJobService.findParsedDocumentJob(
                        userId, sourceId, source.getIngestionRevision()).orElse(null);
                return view(winner, job);
            }
            throw new DomainException("PARSED_DOCUMENT_CONFLICT", "Another parsed document already won this revision");
        }
        if (document.getStatus() != ParsedDocumentStatus.UPLOADING
                && document.getStatus() != ParsedDocumentStatus.VALIDATING) {
            throw new DomainException("MUTATION_REJECTED", "Parsed document is not awaiting completion");
        }

        try {
            document.markValidating();
            parsedDocumentRepository.saveAndFlush(document);
            AssetStoragePort.ObjectMetadata object = assetStorage.headObject(document.getObjectKey()).orElse(null);
            if (object == null || object.sizeBytes() != document.getSizeBytes()
                    || !"application/gzip".equalsIgnoreCase(object.mimeType())
                    || object.sha256() == null
                    || !document.getPayloadSha256().equalsIgnoreCase(object.sha256())) {
                throw new DomainException("UPLOAD_VALIDATION_FAILED", "Parsed document object metadata is invalid");
            }
            if (source.getAssetId() == null) {
                throw new DomainException("MUTATION_REJECTED", "FILE Source has no Asset");
            }
            String assetSha = assetService.ensureSha256(userId, source.getAssetId());
            ParsedDocumentValidator.ValidatedParsedDocument validated = validator.validate(
                    assetStorage.openObject(document.getObjectKey()),
                    new ParsedDocumentValidator.Metadata(
                            sourceId, source.getIngestionRevision(), assetSha,
                            document.getPayloadSha256(), object.sizeBytes(),
                            properties.ai().ingestionMaxBytes(), 10_000, 100_000,
                            2_000_000, 100));
            UUID generation = UUID.randomUUID();
            document.accept(validated.plainTextSha256(), generation);
            source.markIndexing();
            sourceRepository.saveAndFlush(source);
            IngestionJobEntity job = ingestionJobService.enqueueParsedDocument(
                    userId, sourceId, document.getId(), source.getIngestionRevision(), document.getGeneration());
            parsedDocumentRepository.saveAndFlush(document);
            return view(document, job);
        } catch (DomainException exception) {
            document.reject();
            parsedDocumentRepository.saveAndFlush(document);
            throw exception;
        } catch (RuntimeException exception) {
            document.reject();
            parsedDocumentRepository.saveAndFlush(document);
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public ParsedDocumentReadView readAccepted(UUID userId, UUID sourceId, UUID parsedDocumentId) {
        SourceEntity source = sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        ParsedDocumentEntity document = parsedDocumentRepository.findByIdAndUserId(parsedDocumentId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Parsed document was not found"));
        if (!Objects.equals(document.getSourceId(), sourceId)) {
            throw new DomainException("RESOURCE_NOT_FOUND", "Parsed document was not found");
        }
        if (!Objects.equals(document.getIngestionRevision(), source.getIngestionRevision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Parsed document revision is no longer current");
        }
        if (document.getStatus() != ParsedDocumentStatus.ACCEPTED) {
            throw new DomainException("MUTATION_REJECTED", "Parsed document is not accepted");
        }
        try (java.io.InputStream input = assetStorage.openObject(document.getObjectKey())) {
            ParsedDocumentValidator.ValidatedParsedDocument validated = validator.validate(
                    input,
                    new ParsedDocumentValidator.Metadata(
                            sourceId, source.getIngestionRevision(), document.getSourceAssetSha256(),
                            document.getPayloadSha256(), document.getSizeBytes(),
                            properties.ai().ingestionMaxBytes(), 10_000, 100_000,
                            2_000_000, 100));
            if (!Objects.equals(document.getPlainTextSha256(), validated.plainTextSha256())) {
                throw new DomainException("PARSED_DOCUMENT_INVALID", "Accepted parsed document hash changed");
            }
            return new ParsedDocumentReadView(
                    document.getId(), sourceId, source.getIngestionRevision(), document.getGeneration(),
                    validated.blocks());
        } catch (DomainException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new DomainException("PARSED_DOCUMENT_INVALID", "Accepted parsed document could not be read");
        } catch (java.io.IOException exception) {
            throw new DomainException("PARSED_DOCUMENT_INVALID", "Accepted parsed document could not be read");
        }
    }

    private ParsedDocumentCompleteView view(ParsedDocumentEntity document, IngestionJobEntity job) {
        return new ParsedDocumentCompleteView(
                document.getId(), document.getStatus(), document.getGeneration(), job == null ? null : job.getId());
    }

    private String normalizeRequired(String value) {
        return value.trim();
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalizeHash(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(Locale.ROOT);
    }
}
