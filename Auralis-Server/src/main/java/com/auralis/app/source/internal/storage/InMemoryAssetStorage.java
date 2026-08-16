package com.auralis.app.source.internal.storage;

import com.auralis.app.source.AssetStoragePort;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Profile("test")
public class InMemoryAssetStorage implements AssetStoragePort {

    private final Map<String, ObjectMetadata> objects = new ConcurrentHashMap<>();
    private final Map<String, byte[]> contents = new ConcurrentHashMap<>();

    @Override
    public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes) {
        return new UploadIntent(
                "https://memory-storage.test/upload/" + objectKey,
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
                "https://memory-storage.test/download/" + objectKey,
                Instant.now().plusSeconds(300));
    }

    @Override
    public InputStream openObject(String objectKey) {
        byte[] content = contents.get(objectKey);
        if (content == null) {
            throw new IllegalArgumentException("Object was not found");
        }
        return new ByteArrayInputStream(content);
    }

    public void putObject(String objectKey, byte[] content) {
        contents.put(objectKey, content.clone());
    }
}
