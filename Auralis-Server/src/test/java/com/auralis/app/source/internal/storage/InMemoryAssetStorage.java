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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@Component
@Profile("test")
public class InMemoryAssetStorage implements AssetStoragePort {

    private final Map<String, ObjectMetadata> objects = new ConcurrentHashMap<>();
    private final Map<String, byte[]> contents = new ConcurrentHashMap<>();
    private volatile CountDownLatch uploadIntentEntered = new CountDownLatch(0);
    private volatile CountDownLatch uploadIntentReleased = new CountDownLatch(0);

    @Override
    public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
        CountDownLatch entered = uploadIntentEntered;
        CountDownLatch released = uploadIntentReleased;
        if (entered.getCount() > 0) {
            entered.countDown();
            try {
                if (!released.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Test upload intent was not released");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Test upload intent was interrupted", exception);
            } finally {
                uploadIntentEntered = new CountDownLatch(0);
                uploadIntentReleased = new CountDownLatch(0);
            }
        }
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

    @Override
    public void deleteObject(String objectKey) {
        objects.remove(objectKey);
        contents.remove(objectKey);
    }

    public void putObject(String objectKey, byte[] content) {
        contents.put(objectKey, content.clone());
    }

    public void blockNextUploadIntent() {
        uploadIntentEntered = new CountDownLatch(1);
        uploadIntentReleased = new CountDownLatch(1);
    }

    public boolean awaitUploadIntentStarted() throws InterruptedException {
        return uploadIntentEntered.await(5, TimeUnit.SECONDS);
    }

    public void releaseUploadIntent() {
        uploadIntentReleased.countDown();
    }
}
