package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetUploadIntentCommand;
import com.auralis.app.source.AssetUploadStatus;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
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
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@Import(AssetShaBackfillTests.StorageConfiguration.class)
class AssetShaBackfillTests {

    @Autowired
    private IdentityService identityService;

    @Autowired
    private AssetService assetService;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private TestAssetStorage storage;

    @BeforeEach
    void cleanData() {
        assetRepository.deleteAll();
        storage.clear();
    }

    @Test
    void hashesLegacyAssetFromServerObjectAndConditionallyBackfillsOnlyOnce() throws Exception {
        AuthResult owner = register("asset-sha-backfill");
        var intent = assetService.createUploadIntent(owner.user().id(),
                new AssetUploadIntentCommand(0, UUID.randomUUID(), "legacy.pdf", 11, "application/pdf", null));
        String key = assetRepository.findById(intent.assetId()).orElseThrow().getObjectKey();
        storage.put(key, new AssetStoragePort.ObjectMetadata(11, "application/pdf", null), "server-bytes");
        assetService.complete(owner.user().id(), intent.assetId());

        String sha = assetService.ensureSha256(owner.user().id(), intent.assetId());
        assertThat(sha).isEqualTo(sha256("server-bytes"));
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getSha256()).isEqualTo(sha);

        storage.put(key, new AssetStoragePort.ObjectMetadata(11, "application/pdf", "wrong-client-value"), "changed-bytes");
        assertThat(assetService.ensureSha256(owner.user().id(), intent.assetId())).isEqualTo(sha);
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getSha256()).isEqualTo(sha);
    }

    @Test
    void replaysOriginalUploadWithoutChecksumAfterServerBackfill() throws Exception {
        AuthResult owner = register("asset-sha-replay");
        var command = new AssetUploadIntentCommand(
                0, UUID.randomUUID(), "notes.pdf", 11, "application/pdf", null);
        var intent = assetService.createUploadIntent(owner.user().id(), command);
        String key = assetRepository.findById(intent.assetId()).orElseThrow().getObjectKey();
        storage.put(key, new AssetStoragePort.ObjectMetadata(11, "application/pdf", null), "server-bytes");
        assetService.complete(owner.user().id(), intent.assetId());
        String sha = assetService.ensureSha256(owner.user().id(), intent.assetId());

        var replay = assetService.createUploadIntent(owner.user().id(), command);
        assertThat(replay.assetId()).isEqualTo(intent.assetId());
        assertThat(replay.uploadStatus()).isEqualTo(AssetUploadStatus.READY);
        assertThat(replay.uploadUrl()).isNull();
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getSha256()).isEqualTo(sha);

        var mismatches = java.util.List.of(
                new AssetUploadIntentCommand(0, command.clientImportId(), "notes.pdf", 11, "application/pdf", "0".repeat(64)),
                new AssetUploadIntentCommand(0, command.clientImportId(), "renamed.pdf", 11, "application/pdf", null),
                new AssetUploadIntentCommand(0, command.clientImportId(), "notes.pdf", 12, "application/pdf", null),
                new AssetUploadIntentCommand(0, command.clientImportId(), "notes.pdf", 11, "image/png", null));
        mismatches.forEach(mismatch -> assertThatThrownBy(() ->
                assetService.createUploadIntent(owner.user().id(), mismatch))
                .isInstanceOfSatisfying(DomainException.class,
                        error -> assertThat(error.code()).isEqualTo("MUTATION_REJECTED")));
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getSha256()).isEqualTo(sha);
    }

    @Test
    void omittedChecksumOnPendingAndFailedRetriesKeepsOriginalVerification() throws Exception {
        AuthResult owner = register("asset-sha-optional-retry");
        String sha = sha256("server-bytes");
        UUID clientImportId = UUID.randomUUID();
        var intent = assetService.createUploadIntent(owner.user().id(),
                new AssetUploadIntentCommand(0, clientImportId, "notes.pdf", 11, "application/pdf", sha));
        String key = assetRepository.findById(intent.assetId()).orElseThrow().getObjectKey();
        var withoutChecksum = new AssetUploadIntentCommand(
                0, clientImportId, "notes.pdf", 11, "application/pdf", null);

        var pendingRetry = assetService.createUploadIntent(owner.user().id(), withoutChecksum);
        assertThat(pendingRetry.assetId()).isEqualTo(intent.assetId());
        assertThat(pendingRetry.headers()).containsEntry("X-Amz-Meta-Sha256", sha);
        storage.put(key, new AssetStoragePort.ObjectMetadata(11, "application/pdf", null), "server-bytes");
        assertThatThrownBy(() -> assetService.complete(owner.user().id(), intent.assetId()))
                .isInstanceOfSatisfying(DomainException.class,
                        error -> assertThat(error.code()).isEqualTo("UPLOAD_VALIDATION_FAILED"));
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getUploadStatus())
                .isEqualTo(AssetUploadStatus.FAILED);

        var failedRetry = assetService.createUploadIntent(owner.user().id(), withoutChecksum);
        assertThat(failedRetry.assetId()).isEqualTo(intent.assetId());
        assertThat(failedRetry.headers()).containsEntry("X-Amz-Meta-Sha256", sha);
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getSha256()).isEqualTo(sha);
        storage.put(key, new AssetStoragePort.ObjectMetadata(11, "application/pdf", sha), "server-bytes");
        assertThat(assetService.complete(owner.user().id(), intent.assetId()).uploadStatus())
                .isEqualTo(AssetUploadStatus.READY);
    }

    @Test
    void concurrentBackfillLeavesOneStableHash() throws Exception {
        AuthResult owner = register("asset-sha-concurrent");
        var intent = assetService.createUploadIntent(owner.user().id(),
                new AssetUploadIntentCommand(0, UUID.randomUUID(), "legacy.pdf", 11, "application/pdf", null));
        String key = assetRepository.findById(intent.assetId()).orElseThrow().getObjectKey();
        storage.put(key, new AssetStoragePort.ObjectMetadata(11, "application/pdf", null), "server-bytes");
        assetService.complete(owner.user().id(), intent.assetId());

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<String> first = executor.submit(() -> assetService.ensureSha256(owner.user().id(), intent.assetId()));
            Future<String> second = executor.submit(() -> assetService.ensureSha256(owner.user().id(), intent.assetId()));
            assertThat(first.get()).isEqualTo(second.get()).isEqualTo(sha256("server-bytes"));
        } finally {
            executor.shutdownNow();
        }
        assertThat(assetRepository.findById(intent.assetId()).orElseThrow().getSha256())
                .isEqualTo(sha256("server-bytes"));
    }

    private AuthResult register(String suffix) {
        return AuthTestAccounts.register(identityService, suffix + "@example.com", "correct horse battery staple",
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }

    private String sha256(String value) throws Exception {
        return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
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
        private final Map<String, String> contents = new HashMap<>();

        @Override
        public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", mimeType);
            if (sha256 != null) {
                headers.put("X-Amz-Meta-Sha256", sha256);
            }
            return new UploadIntent("https://storage.test/upload/" + objectKey,
                    Map.copyOf(headers), Instant.now().plusSeconds(300));
        }

        @Override
        public Optional<ObjectMetadata> headObject(String objectKey) {
            return Optional.ofNullable(objects.get(objectKey));
        }

        @Override
        public DownloadUrl createDownloadUrl(String objectKey) {
            return new DownloadUrl("https://storage.test/download/" + objectKey, Instant.now().plusSeconds(300));
        }

        @Override
        public InputStream openObject(String objectKey) {
            return new ByteArrayInputStream(contents.getOrDefault(objectKey, "").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }

        @Override
        public void deleteObject(String objectKey) {
            objects.remove(objectKey);
            contents.remove(objectKey);
        }

        void put(String key, ObjectMetadata metadata, String content) {
            objects.put(key, metadata);
            contents.put(key, content);
        }

        void clear() {
            objects.clear();
            contents.clear();
        }
    }
}
