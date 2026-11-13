package com.auralis.app;

import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetUploadIntentCommand;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(ParsedDocumentControllerTests.StorageConfiguration.class)
class ParsedDocumentControllerTests {

    private static final String SHA256 = "a".repeat(64);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SourceService sourceService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private AssetService assetService;

    @Autowired
    private SourceRepository sourceRepository;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private ParsedDocumentRepository parsedDocumentRepository;

    @Autowired
    private TestAssetStorage assetStorage;

    @BeforeEach
    void cleanData() {
        parsedDocumentRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
        assetStorage.clear();
    }

    @Test
    void createsOwnerScopedIntentWithPrivateObjectKeyAndSignedHeaders() throws Exception {
        Fixture fixture = createReadyFile("parsed-document-owner");

        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, bearer(fixture.owner().tokens().accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(intentJson(fixture.source().ingestionRevision(), SHA256, 2048)))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION,
                        org.hamcrest.Matchers.startsWith("/api/sources/" + fixture.source().id()
                                + "/parsed-documents/")))
                .andExpect(jsonPath("$.parsedDocumentId").isNotEmpty())
                .andExpect(jsonPath("$.ingestionRevision").value(fixture.source().ingestionRevision().toString()))
                .andExpect(jsonPath("$.uploadUrl").value(org.hamcrest.Matchers.startsWith("https://storage.test/")))
                .andExpect(jsonPath("$.headers.Content-Type").value("application/gzip"))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty());

        assertThat(assetStorage.lastObjectKey)
                .startsWith("users/" + fixture.owner().user().id() + "/sources/" + fixture.source().id()
                        + "/revisions/" + fixture.source().ingestionRevision() + "/parsed-documents/");
        assertThat(assetStorage.lastObjectKey).doesNotContain("..", "\\");
        assertThat(parsedDocumentRepository.findAll()).singleElement()
                .satisfies(parsed -> {
                    assertThat(parsed.getStatus()).isEqualTo(com.auralis.app.source.ParsedDocumentStatus.UPLOADING);
                    assertThat(parsed.getUserId()).isEqualTo(fixture.owner().user().id());
                    assertThat(parsed.getSourceId()).isEqualTo(fixture.source().id());
                    assertThat(parsed.getIngestionRevision()).isEqualTo(fixture.source().ingestionRevision());
                    assertThat(parsed.getPayloadSha256()).isEqualTo(SHA256);
                });
        assertThat(sourceService.get(fixture.owner().user().id(), fixture.source().id()).ingestionStatus().name())
                .isEqualTo("AWAITING_CLIENT");
    }

    @Test
    void rejectsOtherOwnersAndStaleRevisions() throws Exception {
        Fixture fixture = createReadyFile("parsed-document-scope");
        AuthResult other = register("parsed-document-other");
        String json = intentJson(fixture.source().ingestionRevision(), SHA256, 2048);

        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, bearer(other.tokens().accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, bearer(fixture.owner().tokens().accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(intentJson(UUID.randomUUID(), SHA256, 2048)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MUTATION_REJECTED"));
    }

    @Test
    void rejectsInvalidParserSchemaHashesAndSizeBeforeCreatingIntent() throws Exception {
        Fixture fixture = createReadyFile("parsed-document-validation");
        String auth = bearer(fixture.owner().tokens().accessToken());

        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(intentJson(fixture.source().ingestionRevision(), "bad", 2048)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(intentJson(fixture.source().ingestionRevision(), SHA256, 0).replace(
                                "\"schemaVersion\":1", "\"schemaVersion\":2")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(intentJson(fixture.source().ingestionRevision(), SHA256, 0)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/sources/{sourceId}/parsed-documents/upload-intents", fixture.source().id())
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(intentJson(fixture.source().ingestionRevision(), SHA256, 2048)
                                .replace("\"sourceAssetSha256\":\"" + SHA256 + "\",", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        assertThat(assetStorage.lastObjectKey).isNull();
        assertThat(parsedDocumentRepository.count()).isZero();
    }

    private Fixture createReadyFile(String suffix) {
        AuthResult owner = register(suffix);
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Parsed documents", null, null, "001"));
        var assetIntent = assetService.createUploadIntent(owner.user().id(), new AssetUploadIntentCommand(
                0L, UUID.randomUUID(), "source.pdf", 20L, "application/pdf", SHA256));
        String objectKey = assetRepository.findByIdAndUserId(assetIntent.assetId(), owner.user().id())
                .orElseThrow().getObjectKey();
        assetStorage.put(objectKey, new AssetStoragePort.ObjectMetadata(20L, "application/pdf", SHA256));
        assetService.complete(owner.user().id(), assetIntent.assetId());
        SourceView source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.FILE, "source.pdf", assetIntent.assetId(), null, null, null));
        assetStorage.clearLastObjectKey();
        return new Fixture(owner, source);
    }

    private AuthResult register(String suffix) {
        return identityService.register(
                suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }

    private String intentJson(UUID revision, String payloadSha256, long sizeBytes) {
        return "{\"ingestionRevision\":\"" + revision + "\","
                + "\"schemaVersion\":1,\"parserId\":\"auralis-document-parser\","
                + "\"parserVersion\":\"1.0.0\",\"normalizationVersion\":\"1\","
                + "\"ocrModelVersion\":\"pp-ocrv6-small\",\"sourceAssetSha256\":\"" + SHA256 + "\","
                + "\"payloadSha256\":\"" + payloadSha256 + "\",\"sizeBytes\":" + sizeBytes + "}";
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Fixture(AuthResult owner, SourceView source) {
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
        private String lastObjectKey;

        @Override
        public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
            lastObjectKey = objectKey;
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
            lastObjectKey = null;
        }

        void clearLastObjectKey() {
            lastObjectKey = null;
        }
    }
}
