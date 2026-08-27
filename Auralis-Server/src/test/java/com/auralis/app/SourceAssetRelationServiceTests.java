package com.auralis.app;

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
import com.auralis.app.shared.domain.SourceIngestionRequestedEvent;
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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@Import(SourceAssetRelationServiceTests.StorageConfiguration.class)
@RecordApplicationEvents
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

    @Autowired
    private ApplicationEvents applicationEvents;

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
                0L, "notes.md", 20L, "text/markdown", "a".repeat(64)));
        String objectKey = assetRepository.findByIdAndUserId(intent.assetId(), owner.user().id())
                .orElseThrow()
                .getObjectKey();
        assetStorage.put(objectKey, new AssetStoragePort.ObjectMetadata(20L, "text/markdown", "a".repeat(64)));

        var ready = assetService.complete(owner.user().id(), intent.assetId());
        assertThat(ready.uploadStatus()).isEqualTo(AssetUploadStatus.READY);
        assertThat(ready.completedAt()).isNotNull();
        assertThat(assetService.downloadUrl(owner.user().id(), intent.assetId()).url())
                .startsWith("https://storage.test/download/");
    }

    @Test
    void invalidAssetCompletionPersistsFailedStatus() {
        var owner = register("asset-failed");
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, "notes.md", 20L, "text/markdown", null));

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
                new SubjectCommand("Reading", null, null, null, "001"));

        SourceView textSource = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "A note", null, null, "raw text", "{}"));
        assertThat(textSource.ingestionStatus().name()).isEqualTo("PENDING");

        knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                subject.id(), textSource.id(), "Linked block", null, "body", List.of(), null));

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
                new SubjectCommand("Files", null, null, null, "001"));
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, "notes.pdf", 3982329L, "application/pdf", null));
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
        assertThat(applicationEvents.stream(SourceIngestionRequestedEvent.class)).isEmpty();
    }

    @Test
    void textAndUrlSourcesStillPublishServerIngestionEvents() {
        var owner = register("source-events");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Events", null, null, null, "001"));

        SourceView textSource = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "A note", null, null, "raw text", null));
        SourceView urlSource = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.URL, "A link", null, "https://example.com/read", null, null));

        assertThat(textSource.ingestionStatus().name()).isEqualTo("PENDING");
        assertThat(urlSource.ingestionStatus().name()).isEqualTo("PENDING");
        assertThat(applicationEvents.stream(SourceIngestionRequestedEvent.class)).hasSize(2);
    }

    @Test
    void fileAssetReplacementAndReingestAwaitClientWithoutAllowingRevisionOverwrite() {
        var owner = register("source-revision");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Revision", null, null, null, "001"));
        var firstIntent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, "first.pdf", 20L, "application/pdf", null));
        String firstKey = assetRepository.findByIdAndUserId(firstIntent.assetId(), owner.user().id())
                .orElseThrow().getObjectKey();
        assetStorage.put(firstKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", null));
        assetService.complete(owner.user().id(), firstIntent.assetId());

        SourceView created = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.FILE, "first.pdf", firstIntent.assetId(), null, null, null));
        UUID initialRevision = created.ingestionRevision();
        assertThat(applicationEvents.stream(SourceIngestionRequestedEvent.class)).isEmpty();

        var secondIntent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, "second.pdf", 20L, "application/pdf", null));
        String secondKey = assetRepository.findByIdAndUserId(secondIntent.assetId(), owner.user().id())
                .orElseThrow().getObjectKey();
        assetStorage.put(secondKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", null));
        assetService.complete(owner.user().id(), secondIntent.assetId());

        SourceView replaced = sourceService.update(owner.user().id(), created.id(), created.version(), new SourceCommand(
                subject.id(), SourceType.FILE, "second.pdf", secondIntent.assetId(), null, null, null));
        assertThat(replaced.ingestionStatus().name()).isEqualTo("AWAITING_CLIENT");
        assertThat(replaced.ingestionRevision()).isNotNull().isNotEqualTo(initialRevision);
        assertThat(applicationEvents.stream(SourceIngestionRequestedEvent.class)).isEmpty();

        SourceView reingested = sourceService.reingest(owner.user().id(), replaced.id(), replaced.version());
        assertThat(reingested.ingestionStatus().name()).isEqualTo("AWAITING_CLIENT");
        assertThat(reingested.ingestionRevision()).isNotNull().isNotEqualTo(replaced.ingestionRevision());
        assertThat(applicationEvents.stream(SourceIngestionRequestedEvent.class)).isEmpty();
    }

    @Test
    void expiredSoftDeletedSourceCleansObjectAndKeepsAuditableAssetRow() {
        var owner = register("source-cleanup");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Cleanup", null, null, null, "001"));
        var intent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, "notes.pdf", 20L, "application/pdf", null));
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
                new SubjectCommand("First", null, null, null, "001"));
        SubjectView second = subjectService.create(owner.user().id(),
                new SubjectCommand("Second", null, null, null, "002"));

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
        assertThat(relationService.list(owner.user().id())).isEmpty();
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

        @Override
        public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
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
    }

    private com.auralis.app.identity.AuthResult register(String suffix) {
        return identityService.register(
                suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }
}
