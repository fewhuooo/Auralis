package com.auralis.app.source.internal.storage;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.AssetStoragePort;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectArgs;
import io.minio.Signer;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.http.Method;
import okhttp3.HttpUrl;
import okhttp3.Request;
import okhttp3.RequestBody;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
@Profile("!test")
@ConditionalOnProperty(prefix = "auralis.upload", name = "storage-provider", havingValue = "minio")
public class MinioAssetStorage implements AssetStoragePort {

    private final MinioClient minioClient;
    private final AuralisProperties.Storage storage;

    public MinioAssetStorage(AuralisProperties properties) {
        this.storage = properties.upload().storage();
        if (storage == null || isBlank(storage.endpoint()) || isBlank(storage.bucket())
                || isBlank(storage.accessKey()) || isBlank(storage.secretKey())) {
            throw new IllegalStateException("MinIO storage configuration is incomplete");
        }
        this.minioClient = MinioClient.builder()
                .endpoint(storage.endpoint())
                .credentials(storage.accessKey(), storage.secretKey())
                .build();
    }

    @Override
    public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
        try {
            String url = presignedPutUrl(objectKey, mimeType, sizeBytes, sha256);
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", mimeType);
            headers.put("Content-Length", Long.toString(sizeBytes));
            if (sha256 != null && !sha256.isBlank()) {
                headers.put("X-Amz-Meta-Sha256", sha256);
            }
            return new UploadIntent(url, Map.copyOf(headers), Instant.now().plusSeconds(expirySeconds()));
        } catch (Exception exception) {
            throw storageUnavailable();
        }
    }

    private String presignedPutUrl(String objectKey, String mimeType, long sizeBytes, String sha256)
            throws java.security.InvalidKeyException, java.security.NoSuchAlgorithmException {
        HttpUrl endpoint = HttpUrl.parse(storage.endpoint());
        if (endpoint == null) {
            throw new IllegalStateException("MinIO endpoint is invalid");
        }

        HttpUrl objectUrl = endpoint.newBuilder()
                .addPathSegment(storage.bucket())
                .addPathSegments(objectKey)
                .build();
        Request.Builder request = new Request.Builder()
                .url(objectUrl)
                .put(RequestBody.create(new byte[0], null));
        request.header("Host", hostHeader(objectUrl));
        if (mimeType != null && !mimeType.isBlank()) {
            request.header("Content-Type", mimeType);
        }
        request.header("Content-Length", Long.toString(sizeBytes));
        if (sha256 != null && !sha256.isBlank()) {
            request.header("X-Amz-Meta-Sha256", sha256);
        }
        request.header("x-amz-date", io.minio.Time.AMZ_DATE_FORMAT.format(
                java.time.ZonedDateTime.now(io.minio.Time.UTC)));

        return Signer.presignV4(
                request.build(),
                "us-east-1",
                storage.accessKey(),
                storage.secretKey(),
                expirySeconds()).toString();
    }

    private String hostHeader(HttpUrl url) {
        boolean defaultPort = (url.isHttps() && url.port() == 443)
                || (!url.isHttps() && url.port() == 80);
        return url.host() + (defaultPort ? "" : ":" + url.port());
    }

    @Override
    public Optional<ObjectMetadata> headObject(String objectKey) {
        try {
            StatObjectResponse response = minioClient.statObject(StatObjectArgs.builder()
                    .bucket(storage.bucket())
                    .object(objectKey)
                    .build());
            return Optional.of(new ObjectMetadata(
                    response.size(),
                    response.contentType(),
                    sha256(response.userMetadata())));
        } catch (io.minio.errors.ErrorResponseException exception) {
            if (exception.errorResponse() != null && "NoSuchKey".equals(exception.errorResponse().code())) {
                return Optional.empty();
            }
            throw storageUnavailable();
        } catch (Exception exception) {
            throw storageUnavailable();
        }
    }

    @Override
    public DownloadUrl createDownloadUrl(String objectKey) {
        try {
            String url = minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(storage.bucket())
                    .object(objectKey)
                    .expiry(expirySeconds())
                    .build());
            return new DownloadUrl(url, Instant.now().plusSeconds(expirySeconds()));
        } catch (Exception exception) {
            throw storageUnavailable();
        }
    }

    @Override
    public InputStream openObject(String objectKey) {
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(storage.bucket())
                    .object(objectKey)
                    .build());
        } catch (Exception exception) {
            throw storageUnavailable();
        }
    }

    @Override
    public void deleteObject(String objectKey) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(storage.bucket())
                    .object(objectKey)
                    .build());
        } catch (Exception exception) {
            throw storageUnavailable();
        }
    }

    private int expirySeconds() {
        return Math.toIntExact(storage.presignTtlSeconds());
    }

    private String sha256(Map<String, String> userMetadata) {
        if (userMetadata == null) {
            return null;
        }
        Map<String, String> normalized = new HashMap<>();
        userMetadata.forEach((key, value) -> normalized.put(key.toLowerCase(Locale.ROOT), value));
        return normalized.getOrDefault("sha256", normalized.get("x-amz-meta-sha256"));
    }

    private DomainException storageUnavailable() {
        return new DomainException("MUTATION_REJECTED", "Object storage is unavailable");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
