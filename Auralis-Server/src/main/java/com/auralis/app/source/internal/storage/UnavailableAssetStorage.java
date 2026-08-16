package com.auralis.app.source.internal.storage;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.AssetStoragePort;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.io.InputStream;

@Component
@Profile("!test")
@ConditionalOnProperty(
        prefix = "auralis.upload",
        name = "storage-provider",
        havingValue = "unavailable",
        matchIfMissing = true)
public class UnavailableAssetStorage implements AssetStoragePort {

    @Override
    public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes) {
        throw unavailable();
    }

    @Override
    public Optional<ObjectMetadata> headObject(String objectKey) {
        throw unavailable();
    }

    @Override
    public DownloadUrl createDownloadUrl(String objectKey) {
        throw unavailable();
    }

    @Override
    public InputStream openObject(String objectKey) {
        throw unavailable();
    }

    private DomainException unavailable() {
        return new DomainException("MUTATION_REJECTED", "Object storage is not configured");
    }
}
