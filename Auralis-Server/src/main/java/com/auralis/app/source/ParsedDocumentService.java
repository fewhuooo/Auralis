package com.auralis.app.source;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectLockCoordinator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Service
public class ParsedDocumentService {

    private static final String PARSED_DOCUMENT_MIME = "application/gzip";

    private final SourceRepository sourceRepository;
    private final IdentityService identityService;
    private final ParsedDocumentRepository parsedDocumentRepository;
    private final AssetStoragePort assetStorage;
    private final AuralisProperties properties;
    private final AssetService assetService;
    private final ParsedDocumentValidator validator;
    private final ParsedDocumentIngestionPort ingestionJobService;
    private final SourceService sourceService;
    private final SubjectLockCoordinator subjectLockCoordinator;
    private final TransactionTemplate transactions;

    public ParsedDocumentService(
            SourceRepository sourceRepository,
            IdentityService identityService,
            ParsedDocumentRepository parsedDocumentRepository,
            AssetStoragePort assetStorage,
            AuralisProperties properties,
            AssetService assetService,
            ParsedDocumentValidator validator,
            ParsedDocumentIngestionPort ingestionJobService,
            SourceService sourceService,
            SubjectLockCoordinator subjectLockCoordinator,
            PlatformTransactionManager transactionManager) {
        this.sourceRepository = sourceRepository;
        this.identityService = identityService;
        this.parsedDocumentRepository = parsedDocumentRepository;
        this.assetStorage = assetStorage;
        this.properties = properties;
        this.assetService = assetService;
        this.validator = validator;
        this.ingestionJobService = ingestionJobService;
        this.sourceService = sourceService;
        this.subjectLockCoordinator = subjectLockCoordinator;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Transactional
    public ParsedDocumentUploadIntentView createUploadIntent(
            UUID userId, UUID sourceId, ParsedDocumentUploadCommand command) {
        identityService.lockActiveUserForStorage(userId);
        UUID subjectId = sourceRepository.findSubjectIdByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        subjectLockCoordinator.lockSubjects(userId, java.util.List.of(subjectId));
        SourceEntity source = sourceRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        requireSubjectUnchanged(source, subjectId);
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

    @Transactional(propagation = Propagation.NEVER)
    public ParsedDocumentCompleteView complete(UUID userId, UUID sourceId, UUID parsedDocumentId) {
        Preparation preparation = transactions.execute(status -> {
            SourceDocument current = lockCurrent(userId, sourceId, parsedDocumentId);
            ParsedDocumentCompleteView winner = completedWinner(userId, current);
            if (winner != null) {
                return new Preparation(null, winner);
            }
            requirePending(current.document());
            return new Preparation(snapshot(current), null);
        });
        if (preparation.completed() != null) {
            return preparation.completed();
        }

        ParsedDocumentValidator.ValidatedParsedDocument validated;
        try {
            ValidationSnapshot snapshot = preparation.snapshot();
            AssetStoragePort.ObjectMetadata object = assetStorage.headObject(snapshot.objectKey()).orElse(null);
            if (object == null || object.sizeBytes() != snapshot.sizeBytes()
                    || !PARSED_DOCUMENT_MIME.equalsIgnoreCase(object.mimeType())
                    || object.sha256() == null
                    || !snapshot.payloadSha256().equalsIgnoreCase(object.sha256())) {
                throw new DomainException("UPLOAD_VALIDATION_FAILED", "Parsed document object metadata is invalid");
            }
            if (snapshot.assetId() == null) {
                throw new DomainException("MUTATION_REJECTED", "FILE Source has no Asset");
            }
            String assetSha = assetService.ensureSha256(userId, snapshot.assetId());
            if (!assetSha.equalsIgnoreCase(snapshot.sourceAssetSha256())) {
                throw new DomainException("PARSED_DOCUMENT_INVALID", "Upload intent sourceAssetSha256 does not match the current Asset");
            }
            validated = validator.validate(assetStorage.openObject(snapshot.objectKey()), metadata(snapshot));
        } catch (RuntimeException exception) {
            Completion completion = transactions.execute(status -> {
                SourceDocument current = lockCurrent(userId, sourceId, parsedDocumentId);
                requireSnapshot(current, preparation.snapshot());
                ParsedDocumentCompleteView winner = completedWinner(userId, current);
                if (winner != null) {
                    return new Completion(winner, null);
                }
                requirePending(current.document());
                current.document().reject();
                parsedDocumentRepository.saveAndFlush(current.document());
                return new Completion(null, exception);
            });
            if (completion.failure() != null) {
                throw completion.failure();
            }
            return completion.completed();
        }
        return transactions.execute(status -> {
            SourceDocument current = lockCurrent(userId, sourceId, parsedDocumentId);
            requireSnapshot(current, preparation.snapshot());
            ParsedDocumentCompleteView winner = completedWinner(userId, current);
            if (winner != null) {
                return winner;
            }
            requirePending(current.document());
            current.document().accept(validated.plainTextSha256(), UUID.randomUUID());
            sourceService.markIndexing(userId, sourceId);
            IngestionJobReference job = ingestionJobService.enqueueParsedDocument(
                    userId, sourceId, parsedDocumentId, current.source().getIngestionRevision(),
                    current.document().getGeneration());
            parsedDocumentRepository.saveAndFlush(current.document());
            return view(current.document(), job);
        });
    }

    @Transactional(propagation = Propagation.NEVER)
    public ParsedDocumentReadView readAccepted(UUID userId, UUID sourceId, UUID parsedDocumentId) {
        ValidationSnapshot snapshot = transactions.execute(status -> {
            SourceDocument current = lockCurrent(userId, sourceId, parsedDocumentId);
            requireAccepted(current.document());
            return snapshot(current);
        });
        ParsedDocumentValidator.ValidatedParsedDocument validated;
        try (java.io.InputStream input = assetStorage.openObject(snapshot.objectKey())) {
            validated = validator.validate(input, metadata(snapshot));
            if (!Objects.equals(snapshot.plainTextSha256(), validated.plainTextSha256())) {
                throw new DomainException("PARSED_DOCUMENT_INVALID", "Accepted parsed document hash changed");
            }
        } catch (DomainException exception) {
            throw exception;
        } catch (RuntimeException | java.io.IOException exception) {
            throw new DomainException("PARSED_DOCUMENT_INVALID", "Accepted parsed document could not be read");
        }
        return transactions.execute(status -> {
            SourceDocument current = lockCurrent(userId, sourceId, parsedDocumentId);
            requireSnapshot(current, snapshot);
            requireAccepted(current.document());
            if (!Objects.equals(current.document().getGeneration(), snapshot.generation())
                    || !Objects.equals(current.document().getPlainTextSha256(), snapshot.plainTextSha256())) {
                throw new DomainException("INGESTION_REVISION_STALE", "Parsed document changed while being read");
            }
            return new ParsedDocumentReadView(parsedDocumentId, sourceId, snapshot.revision(), snapshot.generation(),
                    validated.parserId(), validated.blocks());
        });
    }

    private SourceDocument lockCurrent(UUID userId, UUID sourceId, UUID parsedDocumentId) {
        identityService.lockActiveUserForStorage(userId);
        UUID subjectId = sourceRepository.findSubjectIdByIdAndUserId(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        subjectLockCoordinator.lockSubjects(userId, java.util.List.of(subjectId));
        SourceEntity source = sourceRepository.findForUpdateByIdAndUserIdAndDeletedAtIsNull(sourceId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        requireSubjectUnchanged(source, subjectId);
        ParsedDocumentEntity document = parsedDocumentRepository.findByIdAndUserId(parsedDocumentId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Parsed document was not found"));
        if (!Objects.equals(document.getSourceId(), sourceId)) {
            throw new DomainException("RESOURCE_NOT_FOUND", "Parsed document was not found");
        }
        if (!Objects.equals(document.getIngestionRevision(), source.getIngestionRevision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Parsed document revision is no longer current");
        }
        if (source.getType() != SourceType.FILE) {
            throw new DomainException("MUTATION_REJECTED", "Parsed documents are only valid for FILE sources");
        }
        return new SourceDocument(source, document);
    }

    private ParsedDocumentCompleteView completedWinner(UUID userId, SourceDocument current) {
        ParsedDocumentEntity document = current.document();
        ParsedDocumentEntity winner = parsedDocumentRepository
                .findFirstByUserIdAndSourceIdAndIngestionRevisionAndStatus(
                        userId, current.source().getId(), current.source().getIngestionRevision(), ParsedDocumentStatus.ACCEPTED)
                .orElse(null);
        if (winner == null) {
            return null;
        }
        if (!winner.getId().equals(document.getId())) {
            if (!winner.getPayloadSha256().equalsIgnoreCase(document.getPayloadSha256())) {
                throw new DomainException("PARSED_DOCUMENT_CONFLICT", "Another parsed document already won this revision");
            }
            document.supersede();
            parsedDocumentRepository.saveAndFlush(document);
        }
        return view(winner, ingestionJobService.findParsedDocumentJob(
                userId, current.source().getId(), current.source().getIngestionRevision()).orElse(null));
    }

    private void requirePending(ParsedDocumentEntity document) {
        if (document.getObjectDeletedAt() != null || (document.getStatus() != ParsedDocumentStatus.UPLOADING
                && document.getStatus() != ParsedDocumentStatus.VALIDATING)) {
            throw new DomainException("MUTATION_REJECTED", "Parsed document is not awaiting completion");
        }
    }

    private void requireAccepted(ParsedDocumentEntity document) {
        if (document.getStatus() != ParsedDocumentStatus.ACCEPTED || document.getObjectDeletedAt() != null) {
            throw new DomainException("MUTATION_REJECTED", "Parsed document is not accepted");
        }
    }

    private void requireSnapshot(SourceDocument current, ValidationSnapshot expected) {
        requireSubjectUnchanged(current.source(), expected.subjectId());
        if (!Objects.equals(current.source().getAssetId(), expected.assetId())
                || !Objects.equals(current.source().getIngestionRevision(), expected.revision())) {
            throw new DomainException("INGESTION_REVISION_STALE", "Source changed while being validated");
        }
    }

    private void requireSubjectUnchanged(SourceEntity source, UUID expectedSubjectId) {
        if (!expectedSubjectId.equals(source.getSubjectId())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Source subject changed while being validated");
        }
    }

    private ValidationSnapshot snapshot(SourceDocument current) {
        ParsedDocumentEntity document = current.document();
        return new ValidationSnapshot(current.source().getSubjectId(), current.source().getAssetId(),
                document.getSourceId(), document.getIngestionRevision(), document.getObjectKey(), document.getSizeBytes(),
                document.getSourceAssetSha256(), document.getPayloadSha256(), document.getPlainTextSha256(), document.getGeneration());
    }

    private ParsedDocumentValidator.Metadata metadata(ValidationSnapshot snapshot) {
        return new ParsedDocumentValidator.Metadata(snapshot.sourceId(), snapshot.revision(), snapshot.sourceAssetSha256(),
                snapshot.payloadSha256(), snapshot.sizeBytes(), properties.ai().ingestionMaxBytes(),
                10_000, 100_000, 2_000_000, 100);
    }

    private record SourceDocument(SourceEntity source, ParsedDocumentEntity document) { }
    private record ValidationSnapshot(UUID subjectId, UUID assetId, UUID sourceId, UUID revision, String objectKey,
                                      long sizeBytes, String sourceAssetSha256, String payloadSha256,
                                      String plainTextSha256, UUID generation) { }
    private record Preparation(ValidationSnapshot snapshot, ParsedDocumentCompleteView completed) { }
    private record Completion(ParsedDocumentCompleteView completed, RuntimeException failure) { }

    private ParsedDocumentCompleteView view(ParsedDocumentEntity document, IngestionJobReference job) {
        return new ParsedDocumentCompleteView(
                document.getId(), document.getStatus(), document.getGeneration(), job == null ? null : job.id());
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
