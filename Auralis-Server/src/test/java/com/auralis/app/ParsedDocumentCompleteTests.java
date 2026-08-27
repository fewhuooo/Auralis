package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetUploadIntentCommand;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.ParsedDocumentStatus;
import com.auralis.app.source.ParsedDocumentUploadCommand;
import com.auralis.app.source.ParsedDocumentUploadIntentView;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
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

        var first = parsedDocumentService.complete(fixture.owner().user().id(), fixture.source().id(), upload.document().getId());
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
                new AssetUploadIntentCommand(0, "replacement.pdf", 12, "application/pdf", ASSET_SHA));
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
        AuthResult owner = identityService.register(suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(), new SubjectCommand("Parsed", null, null, null, "001"));
        var assetIntent = assetService.createUploadIntent(owner.user().id(),
                new AssetUploadIntentCommand(0, "source.pdf", 12, "application/pdf", ASSET_SHA));
        String assetKey = assetRepository.findById(assetIntent.assetId()).orElseThrow().getObjectKey();
        storage.put(assetKey, new AssetStoragePort.ObjectMetadata(12, "application/pdf", ASSET_SHA), "asset-bytes");
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
        @Override public InputStream openObject(String key) { return new ByteArrayInputStream(payloads.getOrDefault(key, new byte[0])); }
        @Override public void deleteObject(String key) { objects.remove(key); payloads.remove(key); }
        void put(String key, ObjectMetadata metadata, String text) { put(key, metadata, text.getBytes(StandardCharsets.UTF_8)); }
        void put(String key, ObjectMetadata metadata, byte[] payload) { objects.put(key, metadata); payloads.put(key, payload); }
        void clear() { objects.clear(); payloads.clear(); }
    }
}
