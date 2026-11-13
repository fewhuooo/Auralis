package com.auralis.app.source;

import java.time.Instant;

public record AssetDownloadUrlView(String url, Instant expiresAt, String originalName, String mimeType) {
}
