package com.auralis.app;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.internal.storage.MinioAssetStorage;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@EnabledIfSystemProperty(named = "auralis.minio.it", matches = "true")
class MinioAssetStorageIntegrationTests {

    private static final String IMAGE = "minio/minio:RELEASE.2025-09-07T16-13-09Z";
    private static final String ACCESS_KEY = "auralis-it-user";
    private static final String SECRET_KEY = "auralis-it-secret-value";
    private static final String BUCKET = "auralis-assets";

    @Container
    static final GenericContainer<?> MINIO = new GenericContainer<>(
            DockerImageName.parse(IMAGE).asCompatibleSubstituteFor("minio/minio"))
            .withEnv("MINIO_ROOT_USER", ACCESS_KEY)
            .withEnv("MINIO_ROOT_PASSWORD", SECRET_KEY)
            .withCommand("server /data --console-address :9001")
            .withExposedPorts(9000);

    @Test
    void completesPresignedPutHeadGetOpenAndDeleteFlow() throws Exception {
        MinioClient admin = client();
        if (!admin.bucketExists(BucketExistsArgs.builder().bucket(BUCKET).build())) {
            admin.makeBucket(MakeBucketArgs.builder().bucket(BUCKET).build());
        }

        MinioAssetStorage storage = new MinioAssetStorage(properties());
        byte[] content = "minio integration content".getBytes(StandardCharsets.UTF_8);
        String sha256 = sha256(content);
        AssetStoragePort.UploadIntent intent = storage.createUploadIntent(
                "users/integration/assets/object-1", "text/plain", content.length, sha256);
        HttpRequest.Builder upload = HttpRequest.newBuilder(URI.create(intent.url()))
                .PUT(HttpRequest.BodyPublishers.ofByteArray(content));
        intent.headers().forEach((name, value) -> {
            if (!"Content-Length".equalsIgnoreCase(name)) {
                upload.header(name, value);
            }
        });
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        HttpResponse<String> uploadResponse = httpClient.send(
                upload.build(), HttpResponse.BodyHandlers.ofString());
        assertThat(uploadResponse.statusCode())
                .withFailMessage("MinIO presigned PUT failed: HTTP %s, body=%s",
                        uploadResponse.statusCode(), uploadResponse.body())
                .isBetween(200, 299);

        assertThat(storage.headObject("users/integration/assets/object-1"))
                .get()
                .satisfies(metadata -> {
                    assertThat(metadata.sizeBytes()).isEqualTo(content.length);
                    assertThat(metadata.mimeType()).isEqualTo("text/plain");
                    assertThat(metadata.sha256()).isEqualTo(sha256);
                });

        HttpResponse<byte[]> downloadResponse = httpClient.send(
                HttpRequest.newBuilder(URI.create(storage.createDownloadUrl(
                        "users/integration/assets/object-1").url())).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(downloadResponse.statusCode()).isEqualTo(200);
        assertThat(downloadResponse.body()).containsExactly(content);

        try (InputStream object = storage.openObject("users/integration/assets/object-1")) {
            assertThat(object.readAllBytes()).containsExactly(content);
        }

        storage.deleteObject("users/integration/assets/object-1");
        assertThat(storage.headObject("users/integration/assets/object-1")).isEmpty();
        storage.deleteObject("users/integration/assets/object-1");
    }

    @Test
    void usesPublicEndpointForBrowserUploadIntentWhenConfigured() {
        String publicEndpoint = endpoint();
        MinioAssetStorage storage = new MinioAssetStorage(properties("http://minio:9000", publicEndpoint));

        AssetStoragePort.UploadIntent intent = storage.createUploadIntent(
                "users/integration/assets/public-endpoint", "text/plain", 4, null);

        URI uploadUrl = URI.create(intent.url());
        URI expected = URI.create(publicEndpoint);
        assertThat(uploadUrl.getHost()).isEqualTo(expected.getHost());
        assertThat(uploadUrl.getPort()).isEqualTo(expected.getPort());
    }

    @Test
    void createsBrowserDownloadUrlWithoutConnectingToPublicEndpoint() {
        String publicEndpoint = "http://public-endpoint.invalid:9000";
        MinioAssetStorage storage = new MinioAssetStorage(properties(endpoint(), publicEndpoint));

        URI downloadUrl = URI.create(storage.createDownloadUrl(
                "users/integration/assets/public-download").url());

        assertThat(downloadUrl.getHost()).isEqualTo("public-endpoint.invalid");
        assertThat(downloadUrl.getPort()).isEqualTo(9000);
        assertThat(downloadUrl.getPath()).contains("/" + BUCKET + "/users/integration/assets/public-download");
    }

    private MinioClient client() {
        return MinioClient.builder()
                .endpoint(endpoint())
                .credentials(ACCESS_KEY, SECRET_KEY)
                .build();
    }

    private String endpoint() {
        return "http://" + MINIO.getHost() + ":" + MINIO.getMappedPort(9000);
    }

    private AuralisProperties properties() {
        return properties(endpoint(), endpoint());
    }

    private AuralisProperties properties(String internalEndpoint, String publicEndpoint) {
        return new AuralisProperties(
                "test",
                new AuralisProperties.Api("http://localhost", "http://localhost"),
                new AuralisProperties.Upload(
                        1024 * 1024,
                        "minio",
                        new AuralisProperties.Storage(internalEndpoint, publicEndpoint, BUCKET, ACCESS_KEY, SECRET_KEY, 300)),
                new AuralisProperties.Identity("test-secret", 900, 900),
                new AuralisProperties.Ai(
                        false, "test-encryption-key", "DEEPSEEK",
                        new AuralisProperties.Defaults(null, null, null),
                        1000, 12000, 8, 1024,
                        1000, 1000, 1, 1024 * 1024, List.of(), false, 1000, 1000, 1));
    }

    private String sha256(byte[] content) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    }
}
