package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.relation.RelationCommand;
import com.auralis.app.relation.RelationNodeType;
import com.auralis.app.relation.RelationService;
import com.auralis.app.relation.RelationType;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetRetentionCleanupService;
import com.auralis.app.source.AssetUploadIntentCommand;
import com.auralis.app.source.AssetUploadStatus;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectView;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@Import(SourceAssetRelationServiceTests.StorageConfiguration.class)
class SourceAssetRelationServiceTests {

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private AssetService assetService;

    @Autowired
    private SourceService sourceService;

    @Autowired
    private KnowledgeBlockService knowledgeBlockService;

    @Autowired
    private RelationService relationService;

    @Autowired
    private TestAssetStorage assetStorage;

    @Autowired
    private RelationRepository relationRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private SourceRepository sourceRepository;

    @Autowired
    private IngestionJobRepository ingestionJobRepository;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private AssetRetentionCleanupService assetRetentionCleanupService;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void cleanData() {
        relationRepository.deleteAll();
        knowledgeBlockRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
        assetStorage.clear();
    }

    @Test
    void assetCompletionUsesServerSideObjectMetadataBeforeReady() {
        var owner = register("asset");
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "notes.md", 20L, "text/markdown", "a".repeat(64)));
        String objectKey = assetRepository.findByIdAndUserId(intent.assetId(), owner.user().id())
                .orElseThrow()
                .getObjectKey();
        assetStorage.put(objectKey, new AssetStoragePort.ObjectMetadata(20L, "text/markdown", "a".repeat(64)));

        var ready = assetService.complete(owner.user().id(), intent.assetId());
        assertThat(ready.uploadStatus()).isEqualTo(AssetUploadStatus.READY);
        assertThat(ready.completedAt()).isNotNull();
        var download = assetService.downloadUrl(owner.user().id(), intent.assetId());
        assertThat(download.url()).startsWith("https://storage.test/download/");
        assertThat(download.originalName()).isEqualTo("notes.md");
        assertThat(download.mimeType()).isEqualTo("text/markdown");
    }

    @Test
    void uploadIntentReplayUsesTheSameAssetForTheSameUserAndImportKey() {
        var owner = register("asset-idempotent");
        UUID clientImportId = UUID.randomUUID();
        var command = new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64));

        var first = assetService.createUploadIntent(owner.user().id(), command);
        var replay = assetService.createUploadIntent(owner.user().id(), command);

        assertThat(replay.assetId()).isEqualTo(first.assetId());
        assertThat(assetRepository.findByIdAndUserId(first.assetId(), owner.user().id()))
                .get()
                .extracting(asset -> asset.getClientImportId())
                .isEqualTo(clientImportId);
    }

    @Test
    void uploadIntentReplayRejectsImmutableMetadataConflict() {
        var owner = register("asset-idempotent-conflict");
        UUID clientImportId = UUID.randomUUID();
        assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64)));

        assertThatThrownBy(() -> assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, clientImportId, "renamed.pdf", 20L, "application/pdf", "a".repeat(64))))
                .isInstanceOf(DomainException.class)
                .satisfies(error -> assertThat(((DomainException) error).code()).isEqualTo("MUTATION_REJECTED"));
    }

    @Test
    void failedUploadIntentReplayReopensTheSameAssetForRetry() {
        var owner = register("asset-idempotent-retry");
        UUID clientImportId = UUID.randomUUID();
        var command = new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64));
        var first = assetService.createUploadIntent(owner.user().id(), command);
        assertThatThrownBy(() -> assetService.complete(owner.user().id(), first.assetId()))
                .isInstanceOf(DomainException.class)
                .satisfies(error -> assertThat(((DomainException) error).code())
                        .isEqualTo("UPLOAD_VALIDATION_FAILED"));

        var retry = assetService.createUploadIntent(owner.user().id(), command);

        assertThat(retry.assetId()).isEqualTo(first.assetId());
        assertThat(assetRepository.findByIdAndUserId(first.assetId(), owner.user().id()))
                .get()
                .extracting(asset -> asset.getUploadStatus())
                .isEqualTo(AssetUploadStatus.UPLOADING);
    }

    @Test
    void uploadSignerFailureKeepsTheCommittedIdempotencyRow() {
        var owner = register("asset-idempotent-signer-failure");
        UUID clientImportId = UUID.randomUUID();
        var command = new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64));
        assetStorage.failNextIntent();

        assertThatThrownBy(() -> assetService.createUploadIntent(owner.user().id(), command))
                .isInstanceOf(IllegalStateException.class);

        var retry = assetService.createUploadIntent(owner.user().id(), command);

        assertThat(assetRepository.findByUserIdAndClientImportId(owner.user().id(), clientImportId))
                .get()
                .extracting(asset -> asset.getId())
                .isEqualTo(retry.assetId());
    }

    @Test
    void readyAssetReplayReturnsStateWithoutAReplacementUploadUrl() {
        var owner = register("asset-idempotent-ready");
        UUID clientImportId = UUID.randomUUID();
        var command = new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64));
        var first = assetService.createUploadIntent(owner.user().id(), command);
        String objectKey = assetRepository.findByIdAndUserId(first.assetId(), owner.user().id())
                .orElseThrow()
                .getObjectKey();
        assetStorage.put(objectKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", "a".repeat(64)));
        assetService.complete(owner.user().id(), first.assetId());

        var replay = assetService.createUploadIntent(owner.user().id(), command);

        assertThat(replay.assetId()).isEqualTo(first.assetId());
        assertThat(replay.uploadStatus()).isEqualTo(AssetUploadStatus.READY);
        assertThat(replay.uploadUrl()).isNull();
    }

    @Test
    void uploadIntentKeyIsScopedToTheOwningUser() {
        var firstOwner = register("asset-idempotent-owner-one");
        var secondOwner = register("asset-idempotent-owner-two");
        UUID clientImportId = UUID.randomUUID();
        var command = new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64));

        var first = assetService.createUploadIntent(firstOwner.user().id(), command);
        var second = assetService.createUploadIntent(secondOwner.user().id(), command);

        assertThat(second.assetId()).isNotEqualTo(first.assetId());
    }

    @Test
    void concurrentUploadIntentReplayConvergesOnOneAsset() throws Exception {
        var owner = register("asset-idempotent-concurrent");
        UUID clientImportId = UUID.randomUUID();
        var command = new AssetUploadIntentCommand(
                0L, clientImportId, "notes.pdf", 20L, "application/pdf", "a".repeat(64));
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> assetService.createUploadIntent(owner.user().id(), command));
            var second = executor.submit(() -> assetService.createUploadIntent(owner.user().id(), command));

            assertThat(second.get().assetId()).isEqualTo(first.get().assetId());
            assertThat(assetRepository.findByUserIdAndClientImportId(owner.user().id(), clientImportId))
                    .isPresent();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void invalidAssetCompletionPersistsFailedStatus() {
        var owner = register("asset-failed");
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "notes.md", 20L, "text/markdown", null));

        assertThatThrownBy(() -> assetService.complete(owner.user().id(), intent.assetId()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("UPLOAD_VALIDATION_FAILED");
        assertThat(assetRepository.findByIdAndUserId(intent.assetId(), owner.user().id())
                .orElseThrow()
                .getUploadStatus()).isEqualTo(AssetUploadStatus.FAILED);
    }

    @Test
    void sourceTypesAndKnowledgeBlockLinksAreOwnerScoped() {
        var owner = register("source-owner");
        var other = register("source-other");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Reading", null, null, "001"));

        SourceView textSource = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "A note", null, null, "raw text", "{}"));
        assertThat(textSource.ingestionStatus().name()).isEqualTo("PENDING");

        knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                subject.id(), textSource.id(), "Linked block", "body", null));

        assertThatThrownBy(() -> sourceService.create(other.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "Cross-user", null, null, "raw text", null)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_NOT_FOUND");

        assertThatThrownBy(() -> sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.URL, "Invalid URL", null, "file:///private", null, null)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void fileSourceViewIncludesReadyAssetSize() {
        var owner = register("source-file-size");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Files", null, null, "001"));
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "notes.pdf", 3982329L, "application/pdf", null));
        String objectKey = assetRepository.findByIdAndUserId(intent.assetId(), owner.user().id())
                .orElseThrow()
                .getObjectKey();
        assetStorage.put(objectKey, new AssetStoragePort.ObjectMetadata(3982329L, "application/pdf", null));
        assetService.complete(owner.user().id(), intent.assetId());

        SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.FILE, "notes.pdf", intent.assetId(), null, null, null));

        assertThat(source.assetSizeBytes()).isEqualTo(3982329L);
        assertThat(source.ingestionStatus().name()).isEqualTo("AWAITING_CLIENT");
        assertThat(source.ingestionRevision()).isNotNull();
        assertThat(ingestionJobRepository.findAll().stream()
                .noneMatch(job -> owner.user().id().equals(job.getUserId())
                        && source.id().equals(job.getSourceId())))
                .isTrue();

        sourceService.delete(owner.user().id(), source.id(), source.version());
        long deletedVersion = sourceRepository.findById(source.id()).orElseThrow().getVersion();
        SourceView restored = sourceService.restore(owner.user().id(), source.id(), deletedVersion);

        assertThat(restored.ingestionStatus().name()).isEqualTo("AWAITING_CLIENT");
        assertThat(ingestionJobRepository.findAll().stream()
                .noneMatch(job -> owner.user().id().equals(job.getUserId())
                        && source.id().equals(job.getSourceId())))
                .isTrue();
    }

    @Test
    void textAndUrlSourcesPersistServerIngestionJobs() {
        var owner = register("source-events");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Events", null, null, "001"));

        SourceView textSource = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "A note", null, null, "raw text", null));
        SourceView urlSource = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.URL, "A link", null, "https://example.com/read", null, null));

        assertThat(textSource.ingestionStatus().name()).isEqualTo("PENDING");
        assertThat(urlSource.ingestionStatus().name()).isEqualTo("PENDING");
        assertThat(ingestionJobRepository.findAll().stream()
                .filter(job -> owner.user().id().equals(job.getUserId()))
                .filter(job -> textSource.id().equals(job.getSourceId()))
                .filter(job -> textSource.ingestionRevision().equals(job.getIngestionRevision())))
                .hasSize(1);
        assertThat(ingestionJobRepository.findAll().stream()
                .filter(job -> owner.user().id().equals(job.getUserId()))
                .filter(job -> urlSource.id().equals(job.getSourceId()))
                .filter(job -> urlSource.ingestionRevision().equals(job.getIngestionRevision())))
                .hasSize(1);
    }

    @Test
    void fileAssetReplacementAndReingestAwaitClientWithoutAllowingRevisionOverwrite() {
        var owner = register("source-revision");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Revision", null, null, "001"));
        var firstIntent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "first.pdf", 20L, "application/pdf", null));
        String firstKey = assetRepository.findByIdAndUserId(firstIntent.assetId(), owner.user().id())
                .orElseThrow().getObjectKey();
        assetStorage.put(firstKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", null));
        assetService.complete(owner.user().id(), firstIntent.assetId());

        SourceView created = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.FILE, "first.pdf", firstIntent.assetId(), null, null, null));
        UUID initialRevision = created.ingestionRevision();

        var secondIntent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "second.pdf", 20L, "application/pdf", null));
        String secondKey = assetRepository.findByIdAndUserId(secondIntent.assetId(), owner.user().id())
                .orElseThrow().getObjectKey();
        assetStorage.put(secondKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", null));
        assetService.complete(owner.user().id(), secondIntent.assetId());

        SourceView replaced = sourceService.update(owner.user().id(), created.id(), created.version(), new SourceCommand(
                subject.id(), SourceType.FILE, "second.pdf", secondIntent.assetId(), null, null, null));
        assertThat(replaced.ingestionStatus().name()).isEqualTo("AWAITING_CLIENT");
        assertThat(replaced.ingestionRevision()).isNotNull().isNotEqualTo(initialRevision);

        SourceView reingested = sourceService.reingest(owner.user().id(), replaced.id(), replaced.version());
        assertThat(reingested.ingestionStatus().name()).isEqualTo("AWAITING_CLIENT");
        assertThat(reingested.ingestionRevision()).isNotNull().isNotEqualTo(replaced.ingestionRevision());
        assertThat(ingestionJobRepository.findAll().stream()
                .noneMatch(job -> owner.user().id().equals(job.getUserId())
                        && replaced.id().equals(job.getSourceId())))
                .isTrue();
    }

    @Test
    void expiredSoftDeletedSourceCleansObjectAndKeepsAuditableAssetRow() {
        var owner = register("source-cleanup");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Cleanup", null, null, "001"));
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "notes.pdf", 20L, "application/pdf", null));
        String objectKey = assetRepository.findByIdAndUserId(intent.assetId(), owner.user().id())
                .orElseThrow()
                .getObjectKey();
        assetStorage.put(objectKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", null));
        assetService.complete(owner.user().id(), intent.assetId());
        SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.FILE, "notes.pdf", intent.assetId(), null, null, null));

        sourceService.delete(owner.user().id(), source.id(), source.version());
        assetRetentionCleanupService.purgeExpired(Instant.now().plusSeconds(1));

        assertThat(assetStorage.headObject(objectKey)).isEmpty();
        assertThat(assetRepository.findByIdAndUserId(intent.assetId(), owner.user().id())
                .orElseThrow()
                .getUploadStatus()).isEqualTo(AssetUploadStatus.ORPHANED);
        assertThat(sourceRepository.findByIdAndUserId(source.id(), owner.user().id())
                .orElseThrow()
                .getDeletedAt()).isNotNull();
    }

    @Test
    void relatedToIsUndirectedAndEndpointDeleteSoftDeletesRelations() {
        var owner = register("relation");
        SubjectView first = subjectService.create(owner.user().id(),
                new SubjectCommand("First", null, null, "001"));
        SubjectView second = subjectService.create(owner.user().id(),
                new SubjectCommand("Second", null, null, "002"));

        relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SUBJECT, first.id(), RelationNodeType.SUBJECT, second.id(),
                RelationType.RELATED_TO, null));
        assertThatThrownBy(() -> relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SUBJECT, second.id(), RelationNodeType.SUBJECT, first.id(),
                RelationType.RELATED_TO, null)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MUTATION_REJECTED");

        subjectService.delete(owner.user().id(), first.id(), first.version());
        assertThat(relationService.list(owner.user().id(), null, 200).items()).isEmpty();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StorageConfiguration {
        @Bean
        @Primary
        TestAssetStorage testAssetStorage() {
            return new TestAssetStorage();
        }
    }

    static class TestAssetStorage implements AssetStoragePort {
        private final Map<String, ObjectMetadata> objects = new HashMap<>();
        private boolean failNextIntent;

        @Override
        public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
            if (failNextIntent) {
                failNextIntent = false;
                throw new IllegalStateException("test signer failure");
            }
            return new UploadIntent(
                    "https://storage.test/upload/" + objectKey,
                    Map.of("Content-Type", mimeType),
                    Instant.now().plusSeconds(300));
        }

        @Override
        public Optional<ObjectMetadata> headObject(String objectKey) {
            return Optional.ofNullable(objects.get(objectKey));
        }

        @Override
        public DownloadUrl createDownloadUrl(String objectKey) {
            return new DownloadUrl(
                    "https://storage.test/download/" + objectKey,
                    Instant.now().plusSeconds(300));
        }

        @Override
        public InputStream openObject(String objectKey) {
            return new ByteArrayInputStream(new byte[0]);
        }

        @Override
        public void deleteObject(String objectKey) {
            objects.remove(objectKey);
        }

        void put(String objectKey, ObjectMetadata metadata) {
            objects.put(objectKey, metadata);
        }

        void clear() {
            objects.clear();
        }

        void failNextIntent() {
            failNextIntent = true;
        }
    }

    private com.auralis.app.identity.AuthResult register(String suffix) {
        return AuthTestAccounts.register(identityService, suffix + "@example.com", "correct horse battery staple",
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }
}
