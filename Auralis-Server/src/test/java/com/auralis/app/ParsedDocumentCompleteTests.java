package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionClaim;
import com.auralis.app.ai.ingestion.IngestionCompletionService;
import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.sync.ChangeLogService;
import com.auralis.app.sync.SyncCursor;
import com.auralis.app.sync.SyncMutationType;
import com.auralis.app.sync.SyncResourceType;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetUploadIntentCommand;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.ParsedDocumentStatus;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.source.ParsedDocumentUploadCommand;
import com.auralis.app.source.ParsedDocumentUploadIntentView;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.realtime.RealtimeEventPublisher;
import com.auralis.app.realtime.RealtimeEventType;
import com.auralis.app.realtime.RealtimeEventView;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.zip.GZIPOutputStream;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@Import(ParsedDocumentCompleteTests.StorageConfiguration.class)
class ParsedDocumentCompleteTests {

    private static final String ASSET_SHA = "b".repeat(64);

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private AssetService assetService;
    @Autowired private SourceService sourceService;
    @Autowired private ParsedDocumentService parsedDocumentService;
    @Autowired private ParsedDocumentRepository parsedDocumentRepository;
    @Autowired private IngestionJobRepository ingestionJobRepository;
    @Autowired private SourceRepository sourceRepository;
    @Autowired private AssetRepository assetRepository;
    @Autowired private TestAssetStorage storage;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ChangeLogService changeLogService;
    @Autowired private RealtimeEventPublisher realtimeEventPublisher;
    @Autowired private IngestionCompletionService ingestionCompletionService;
    @MockitoSpyBean private IngestionJobService ingestionJobService;

    @BeforeEach
    void cleanData() {
        ingestionJobRepository.deleteAll();
        parsedDocumentRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
        storage.clear();
    }

    @Test
    void acceptsOneDocumentIdempotentlyAndCreatesOneIndexingJob() throws Exception {
        Fixture fixture = fixture("complete-replay");
        Upload upload = upload(fixture, "hello");

        long baselineCursor = changeLogService.latestCursor(fixture.owner().user().id()).value();
        var first = parsedDocumentService.complete(fixture.owner().user().id(), fixture.source().id(), upload.document().getId());
        SourceView persisted = sourceService.get(fixture.owner().user().id(), fixture.source().id());
        var completeChanges = changeLogService.pull(
                fixture.owner().user().id(), new SyncCursor(baselineCursor), 10).changes();

        assertThat(completeChanges).singleElement().satisfies(change -> {
            assertThat(change.resourceType()).isEqualTo(SyncResourceType.SOURCE);
            assertThat(change.resourceId()).isEqualTo(fixture.source().id());
            assertThat(change.mutationType()).isEqualTo(SyncMutationType.UPDATE);
            assertThat(change.version()).isEqualTo(persisted.version());
            try {
                var payload = objectMapper.readTree(change.payload());
                assertThat(payload.get("id").asText()).isEqualTo(fixture.source().id().toString());
                assertThat(payload.get("ingestionStatus").asText()).isEqualTo("INDEXING");
                assertThat(payload.get("version").asLong()).isEqualTo(persisted.version());
            } catch (Exception exception) {
                throw new AssertionError("Source change payload must be valid JSON", exception);
            }
        });
        var second = parsedDocumentService.complete(fixture.owner().user().id(), fixture.source().id(), upload.document().getId());
        Upload duplicate = upload(fixture, "hello");
        var samePayload = parsedDocumentService.complete(
                fixture.owner().user().id(), fixture.source().id(), duplicate.document().getId());

        assertThat(first.parsedDocumentId()).isEqualTo(second.parsedDocumentId());
        assertThat(first.status()).isEqualTo(ParsedDocumentStatus.ACCEPTED);
        assertThat(samePayload.parsedDocumentId()).isEqualTo(upload.document().getId());
        assertThat(parsedDocumentRepository.findById(duplicate.document().getId()).orElseThrow().getStatus())
                .isEqualTo(ParsedDocumentStatus.SUPERSEDED);
        assertThat(ingestionJobRepository.findAll()).singleElement().satisfies(job -> {
            assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
            assertThat(job.getParsedDocumentId()).isEqualTo(upload.document().getId());
            assertThat(job.getIngestionRevision()).isEqualTo(fixture.source().ingestionRevision());
            assertThat(job.getGeneration()).isEqualTo(first.generation());
        });

        SourceView reingested = sourceService.reingest(
                fixture.owner().user().id(), fixture.source().id(),
                sourceService.get(fixture.owner().user().id(), fixture.source().id()).version());
        assertThat(reingested.ingestionRevision()).isEqualTo(fixture.source().ingestionRevision());
        assertThat(reingested.ingestionStatus()).isEqualTo(com.auralis.app.source.SourceIngestionStatus.INDEXING);
        assertThat(ingestionJobRepository.findAll()).singleElement()
                .extracting(job -> job.getParsedDocumentId()).isEqualTo(upload.document().getId());
    }

    @Test
    void rejectsDifferentPayloadForSameRevisionAndStaleRevision() throws Exception {
        Fixture fixture = fixture("complete-conflict");
        Upload first = upload(fixture, "hello");
        Upload second = upload(fixture, "different");
        parsedDocumentService.complete(fixture.owner().user().id(), fixture.source().id(), first.document().getId());

        assertThatThrownBy(() -> parsedDocumentService.complete(
                fixture.owner().user().id(), fixture.source().id(), second.document().getId()))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("PARSED_DOCUMENT_CONFLICT");

        var current = sourceService.get(fixture.owner().user().id(), fixture.source().id());
        var replacementIntent = assetService.createUploadIntent(fixture.owner().user().id(),
                new AssetUploadIntentCommand(0, UUID.randomUUID(), "replacement.pdf", 12, "application/pdf", ASSET_SHA));
        String replacementKey = assetRepository.findById(replacementIntent.assetId()).orElseThrow().getObjectKey();
        storage.put(replacementKey, new AssetStoragePort.ObjectMetadata(12, "application/pdf", ASSET_SHA), "replacement");
        assetService.complete(fixture.owner().user().id(), replacementIntent.assetId());
        sourceService.update(fixture.owner().user().id(), fixture.source().id(), current.version(), new SourceCommand(
                current.subjectId(), SourceType.FILE, "replacement.pdf", replacementIntent.assetId(), null, null, null));
        assertThat(parsedDocumentRepository.findById(first.document().getId()).orElseThrow().getStatus())
                .isEqualTo(ParsedDocumentStatus.SUPERSEDED);
        assertThatThrownBy(() -> parsedDocumentService.complete(
                fixture.owner().user().id(), fixture.source().id(), first.document().getId()))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("INGESTION_REVISION_STALE");
    }

    @Test
    void concurrentCompleteHasOnlyOneWinnerAndOneJob() throws Exception {
        Fixture fixture = fixture("complete-concurrent");
        Upload first = upload(fixture, "one");
        Upload second = upload(fixture, "two");
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<String> a = executor.submit(() -> completeCode(fixture, first));
            Future<String> b = executor.submit(() -> completeCode(fixture, second));
            assertThat(java.util.Set.of(a.get(), b.get()))
                    .containsExactlyInAnyOrder("ACCEPTED", "PARSED_DOCUMENT_CONFLICT");
        } finally {
            executor.shutdownNow();
        }
        assertThat(ingestionJobRepository.findAll()).hasSize(1);
    }

    @Test
    void rollsBackAcceptedDocumentSourceIndexingAndSyncEventWhenEnqueueFails() throws Exception {
        Fixture fixture = fixture("complete-atomic-failure");
        Upload upload = upload(fixture, "enqueue failure");
        long baselineCursor = changeLogService.latestCursor(fixture.owner().user().id()).value();
        doThrow(new RuntimeException("injected enqueue failure")).when(ingestionJobService)
                .enqueueParsedDocument(any(), any(), any(), any(), any());

        List<RealtimeEventView> realtimeEvents = new ArrayList<>();
        try (AutoCloseable ignored = realtimeEventPublisher.subscribe(
                fixture.owner().user().id(), realtimeEvents::add)) {
            assertThatThrownBy(() -> parsedDocumentService.complete(
                    fixture.owner().user().id(), fixture.source().id(), upload.document().getId()))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessage("injected enqueue failure");
        }

        assertThat(sourceService.get(fixture.owner().user().id(), fixture.source().id()).ingestionStatus())
                .isEqualTo(com.auralis.app.source.SourceIngestionStatus.AWAITING_CLIENT);
        assertThat(parsedDocumentRepository.findById(upload.document().getId()).orElseThrow().getStatus())
                .isEqualTo(ParsedDocumentStatus.UPLOADING);
        assertThat(ingestionJobRepository.findAll()).isEmpty();
        assertThat(changeLogService.pull(fixture.owner().user().id(), new SyncCursor(baselineCursor), 10).changes())
                .isEmpty();
        assertThat(realtimeEvents).noneMatch(event -> event.type() == RealtimeEventType.SYNC_CHANGED
                && "SOURCE".equals(event.resourceType())
                && fixture.source().id().equals(event.resourceId()));
    }

    @Test
    void restoresIndexingFileWithTheCurrentAcceptedDocumentAndNoDuplicateActiveJob() throws Exception {
        Fixture fixture = fixture("complete-restore");
        UUID ownerId = fixture.owner().user().id();
        UUID sourceId = fixture.source().id();
        UUID revision = fixture.source().ingestionRevision();
        Upload upload = upload(fixture, "hello");
        var completed = parsedDocumentService.complete(ownerId, sourceId, upload.document().getId());

        sourceService.delete(ownerId, sourceId, sourceService.get(ownerId, sourceId).version());
        long deletedVersion = sourceRepository.findById(sourceId).orElseThrow().getVersion();
        var restoredWithActiveJob = sourceService.restore(ownerId, sourceId, deletedVersion);
        assertThat(ingestionJobRepository.findAll()).singleElement()
                .extracting(job -> job.getId()).isEqualTo(completed.ingestionJobId());

        sourceService.delete(ownerId, sourceId, restoredWithActiveJob.version());
        Instant now = Instant.now();
        var claimed = ingestionJobService.claimById(
                ownerId, completed.ingestionJobId(), now, now.plusSeconds(60), 3).orElseThrow();
        ingestionCompletionService.fail(
                IngestionClaim.from(claimed), revision, now, 3, "RESOURCE_NOT_FOUND", "Source was not found");
        assertThat(ingestionJobRepository.findById(claimed.getId()).orElseThrow().getStatus())
                .isEqualTo(IngestionJobStatus.FAILED);

        SourceView restored = sourceService.restore(
                ownerId, sourceId, sourceRepository.findById(sourceId).orElseThrow().getVersion());
        assertThat(restored.ingestionStatus()).isEqualTo(SourceIngestionStatus.INDEXING);
        assertThat(restored.ingestionRevision()).isEqualTo(revision);
        assertThat(ingestionJobRepository.findAll()).filteredOn(job -> !job.getId().equals(claimed.getId()))
                .singleElement().satisfies(job -> {
                    assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
                    assertThat(job.getParsedDocumentId()).isEqualTo(completed.parsedDocumentId());
                    assertThat(job.getIngestionRevision()).isEqualTo(revision);
                    assertThat(job.getGeneration()).isEqualTo(completed.generation());
                });
    }

    @Test
    void restoreRevokesTheDeletedSourceClaimWithoutConsumingTheLastRetry() throws Exception {
        Fixture fixture = fixture("complete-restore-claim");
        UUID ownerId = fixture.owner().user().id();
        UUID sourceId = fixture.source().id();
        UUID revision = fixture.source().ingestionRevision();
        Upload upload = upload(fixture, "hello");
        var completed = parsedDocumentService.complete(ownerId, sourceId, upload.document().getId());
        UUID jobId = completed.ingestionJobId();
        Instant now = Instant.now();
        for (int index = 0; index < 2; index++) {
            var attempt = ingestionJobService.claimById(ownerId, jobId, now, now.plusSeconds(60), 3).orElseThrow();
            assertThat(ingestionCompletionService.fail(IngestionClaim.from(attempt), revision, now, 3,
                    "PROVIDER_TEMPORARY", "Temporary embedding failure")).isTrue();
        }

        var oldClaim = IngestionClaim.from(
                ingestionJobService.claimById(ownerId, jobId, now, now.plusSeconds(60), 3).orElseThrow());
        sourceService.delete(ownerId, sourceId, sourceService.get(ownerId, sourceId).version());
        assertThatThrownBy(() -> sourceService.requireActiveSource(ownerId, sourceId))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("RESOURCE_NOT_FOUND"));
        assertThat(ingestionCompletionService.markIndexing(oldClaim, revision)).isFalse();

        SourceView restored = sourceService.restore(
                ownerId, sourceId, sourceRepository.findById(sourceId).orElseThrow().getVersion());
        assertThat(ingestionCompletionService.markIndexing(oldClaim, revision)).isFalse();
        assertThat(ingestionCompletionService.fail(oldClaim, revision, now, 3,
                "RESOURCE_NOT_FOUND", "Source was not found")).isFalse();
        assertThat(ingestionCompletionService.complete(oldClaim, revision, List.of(), List.of(), now)).isFalse();
        assertThat(ingestionCompletionService.stageCheckpoint(oldClaim, revision, List.of(), List.of())).isFalse();
        assertThatThrownBy(() -> ingestionCompletionService.loadCheckpoint(oldClaim, revision, List.of()))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("INGESTION_REVISION_STALE"));
        var afterStaleClaim = sourceService.get(ownerId, sourceId);
        assertThat(afterStaleClaim.version()).isEqualTo(restored.version());
        assertThat(afterStaleClaim.ingestionStatus()).isEqualTo(SourceIngestionStatus.PENDING);
        assertThat(ingestionJobRepository.findAll()).singleElement().satisfies(job -> {
            assertThat(job.getId()).isEqualTo(jobId);
            assertThat(job.getParsedDocumentId()).isEqualTo(completed.parsedDocumentId());
            assertThat(job.getIngestionRevision()).isEqualTo(revision);
            assertThat(job.getGeneration()).isEqualTo(completed.generation());
            assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
            assertThat(job.getLeaseUntil()).isNull();
            assertThat(job.getFailureCount()).isEqualTo(2);
        });

        var nextAttempt = ingestionJobService.claimById(ownerId, jobId, now, now.plusSeconds(60), 3).orElseThrow();
        assertThat(nextAttempt.getAttemptCount()).isGreaterThan(oldClaim.attemptCount());
        assertThat(nextAttempt.getFailureCount()).isEqualTo(2);
        assertThat(ingestionCompletionService.markIndexing(oldClaim, revision)).isFalse();
        assertThat(ingestionCompletionService.fail(oldClaim, revision, now, 3,
                "RESOURCE_NOT_FOUND", "Source was not found")).isFalse();
        var currentClaim = IngestionClaim.from(nextAttempt);
        assertThat(ingestionCompletionService.markIndexing(currentClaim, revision)).isTrue();
        assertThat(ingestionCompletionService.complete(currentClaim, revision,
                List.of(new TextChunk(0, "hello", 0, 5)), List.of(java.util.Collections.nCopies(1024, 0.1)), now))
                .isTrue();
        assertThat(ingestionCompletionService.markIndexing(oldClaim, revision)).isFalse();
        assertThat(sourceService.get(ownerId, sourceId).ingestionStatus()).isEqualTo(SourceIngestionStatus.READY);
        assertThat(ingestionJobRepository.findById(jobId).orElseThrow().getStatus()).isEqualTo(IngestionJobStatus.READY);
    }

    @Test
    void persistsRejectionWhenTheLegacyAssetChecksumCannotBeRead() throws Exception {
        Fixture fixture = fixture("complete-legacy-asset-read", null);
        UUID ownerId = fixture.owner().user().id();
        UUID sourceId = fixture.source().id();
        var asset = assetRepository.findById(fixture.source().assetId()).orElseThrow();
        assertThat(asset.getSha256()).isNull();
        Upload upload = upload(fixture, "hello");
        storage.deleteObject(asset.getObjectKey());

        assertThatThrownBy(() -> parsedDocumentService.complete(ownerId, sourceId, upload.document().getId()))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("UPLOAD_VALIDATION_FAILED"));
        assertThat(parsedDocumentRepository.findById(upload.document().getId()).orElseThrow().getStatus())
                .isEqualTo(ParsedDocumentStatus.REJECTED);
        assertThat(sourceService.get(ownerId, sourceId).ingestionStatus())
                .isEqualTo(SourceIngestionStatus.AWAITING_CLIENT);
        assertThat(ingestionJobRepository.findAll()).isEmpty();
    }

    @Test
    void rejectsIntentAssetHashMismatchBeforeItCanWinAndAcceptsACorrectedUpload() throws Exception {
        Fixture fixture = fixture("complete-intent-asset-hash");
        UUID ownerId = fixture.owner().user().id();
        UUID sourceId = fixture.source().id();
        byte[] payload = payload(fixture.source(), "hello");
        var intent = parsedDocumentService.createUploadIntent(ownerId, sourceId,
                new ParsedDocumentUploadCommand(fixture.source().ingestionRevision(), 1, "pdfjs", "1", "1",
                        null, "a".repeat(64), sha256(payload), payload.length));
        var document = parsedDocumentRepository.findById(intent.parsedDocumentId()).orElseThrow();
        storage.put(document.getObjectKey(),
                new AssetStoragePort.ObjectMetadata(payload.length, "application/gzip", sha256(payload)), payload);

        assertThatThrownBy(() -> parsedDocumentService.complete(ownerId, sourceId, document.getId()))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("PARSED_DOCUMENT_INVALID"));
        assertThat(parsedDocumentRepository.findById(document.getId()).orElseThrow().getStatus())
                .isEqualTo(ParsedDocumentStatus.REJECTED);
        assertThat(sourceService.get(ownerId, sourceId).ingestionStatus())
                .isEqualTo(SourceIngestionStatus.AWAITING_CLIENT);
        assertThat(ingestionJobRepository.findAll()).isEmpty();

        Upload corrected = upload(fixture, "hello");
        var completed = parsedDocumentService.complete(ownerId, sourceId, corrected.document().getId());
        assertThat(completed.status()).isEqualTo(ParsedDocumentStatus.ACCEPTED);
        assertThat(parsedDocumentService.readAccepted(ownerId, sourceId, completed.parsedDocumentId()).blocks())
                .singleElement().satisfies(block -> assertThat(block.text()).isEqualTo("hello"));
    }

    private String completeCode(Fixture fixture, Upload upload) {
        try {
            return parsedDocumentService.complete(
                    fixture.owner().user().id(), fixture.source().id(), upload.document().getId()).status().name();
        } catch (DomainException exception) {
            return exception.code();
        }
    }

    private Upload upload(Fixture fixture, String text) throws Exception {
        byte[] payload = payload(fixture.source(), text);
        ParsedDocumentUploadIntentView intent = parsedDocumentService.createUploadIntent(
                fixture.owner().user().id(), fixture.source().id(), new ParsedDocumentUploadCommand(
                        fixture.source().ingestionRevision(), 1, "pdfjs", "1", "1", null,
                        ASSET_SHA, sha256(payload), payload.length));
        ParsedDocumentEntity document = parsedDocumentRepository.findById(intent.parsedDocumentId()).orElseThrow();
        storage.put(document.getObjectKey(), new AssetStoragePort.ObjectMetadata(payload.length, "application/gzip", sha256(payload)), payload);
        return new Upload(document, payload);
    }

    private Fixture fixture(String suffix) {
        return fixture(suffix, ASSET_SHA);
    }

    private Fixture fixture(String suffix, String assetSha256) {
        AuthResult owner = identityService.register(suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(), new SubjectCommand("Parsed", null, null, "001"));
        var assetIntent = assetService.createUploadIntent(owner.user().id(),
                new AssetUploadIntentCommand(0, UUID.randomUUID(), "source.pdf", 12, "application/pdf", assetSha256));
        String assetKey = assetRepository.findById(assetIntent.assetId()).orElseThrow().getObjectKey();
        storage.put(assetKey, new AssetStoragePort.ObjectMetadata(12, "application/pdf", assetSha256), "asset-bytes");
        assetService.complete(owner.user().id(), assetIntent.assetId());
        SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.FILE, "source.pdf", assetIntent.assetId(), null, null, null));
        return new Fixture(owner, source);
    }

    private byte[] payload(SourceView source, String text) throws Exception {
        String plainHash = sha256(text + "\n");
        String json = "{\"schemaVersion\":1,\"sourceId\":\"" + source.id()
                + "\",\"ingestionRevision\":\"" + source.ingestionRevision()
                + "\",\"sourceAssetSha256\":\"" + ASSET_SHA
                + "\",\"parser\":{\"id\":\"pdfjs\",\"version\":\"1\",\"normalizationVersion\":\"1\",\"ocrModelVersion\":null},"
                + "\"blocks\":[{\"ordinal\":0,\"kind\":\"paragraph\",\"text\":\"" + text + "\"}],"
                + "\"characterCount\":" + text.length() + ",\"plainTextSha256\":\"" + plainHash + "\"}";
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(output)) {
            gzip.write(json.getBytes(StandardCharsets.UTF_8));
        }
        return output.toByteArray();
    }

    private String sha256(byte[] value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private String sha256(String value) throws Exception {
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private record Fixture(AuthResult owner, SourceView source) { }
    private record Upload(ParsedDocumentEntity document, byte[] payload) { }

    @TestConfiguration(proxyBeanMethods = false)
    static class StorageConfiguration {
        @Bean @Primary TestAssetStorage testAssetStorage() { return new TestAssetStorage(); }
    }

    static class TestAssetStorage implements AssetStoragePort {
        private final Map<String, ObjectMetadata> objects = new HashMap<>();
        private final Map<String, byte[]> payloads = new HashMap<>();
        @Override public UploadIntent createUploadIntent(String key, String mime, long size, String sha) {
            return new UploadIntent("https://storage.test/upload/" + key, Map.of("Content-Type", mime), Instant.now().plusSeconds(300));
        }
        @Override public Optional<ObjectMetadata> headObject(String key) { return Optional.ofNullable(objects.get(key)); }
        @Override public DownloadUrl createDownloadUrl(String key) { return new DownloadUrl("https://storage.test/download/" + key, Instant.now().plusSeconds(300)); }
        @Override public InputStream openObject(String key) {
            byte[] payload = payloads.get(key);
            if (payload == null) {
                throw new IllegalStateException("Object could not be opened");
            }
            return new ByteArrayInputStream(payload);
        }
        @Override public void deleteObject(String key) { objects.remove(key); payloads.remove(key); }
        void put(String key, ObjectMetadata metadata, String text) { put(key, metadata, text.getBytes(StandardCharsets.UTF_8)); }
        void put(String key, ObjectMetadata metadata, byte[] payload) { objects.put(key, metadata); payloads.put(key, payload); }
        void clear() { objects.clear(); payloads.clear(); }
    }
}
