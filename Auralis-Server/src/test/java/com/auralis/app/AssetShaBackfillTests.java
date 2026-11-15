package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetUploadIntentCommand;
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
            return new UploadIntent("https://storage.test/upload/" + objectKey,
                    Map.of("Content-Type", mimeType), Instant.now().plusSeconds(300));
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
