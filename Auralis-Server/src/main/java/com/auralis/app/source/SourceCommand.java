package com.auralis.app.source;

import java.util.UUID;

public record SourceCommand(
        UUID subjectId,
        SourceType type,
        String title,
        UUID assetId,
        String originUrl,
        String rawText,
        String outline) {
}
