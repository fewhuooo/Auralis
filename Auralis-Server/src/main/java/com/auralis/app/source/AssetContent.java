package com.auralis.app.source;

import java.io.InputStream;
import java.io.IOException;
import java.util.UUID;

public record AssetContent(
        UUID assetId,
        String objectKey,
        String originalName,
        String mimeType,
        long sizeBytes,
        InputStream stream) implements AutoCloseable {

    @Override
    public void close() throws IOException {
        stream.close();
    }
}
