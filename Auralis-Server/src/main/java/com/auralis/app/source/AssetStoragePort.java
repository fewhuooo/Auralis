package com.auralis.app.source;

import java.io.InputStream;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

public interface AssetStoragePort {

    UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256);

    Optional<ObjectMetadata> headObject(String objectKey);

    DownloadUrl createDownloadUrl(String objectKey);

    InputStream openObject(String objectKey);

    void deleteObject(String objectKey);

    record UploadIntent(String url, Map<String, String> headers, Instant expiresAt) {
    }

    record ObjectMetadata(long sizeBytes, String mimeType, String sha256) {
    }

    record DownloadUrl(String url, Instant expiresAt) {
    }
}
