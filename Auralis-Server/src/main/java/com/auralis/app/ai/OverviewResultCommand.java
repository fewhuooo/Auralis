package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.List;
import java.time.Instant;
import java.util.UUID;

public record OverviewResultCommand(
        @NotNull @PositiveOrZero Long baseVersion,
        @NotNull UUID clientWriteId,
        @NotNull OverviewMode mode,
        UUID ingestionRevision,
        List<@Valid OverviewSourceManifestEntry> sourceManifest,
        String inputFingerprint,
        Instant outlineGeneratedAt,
        Instant summaryGeneratedAt,
        @NotNull @Valid OverviewResponse result) {
    public OverviewResultCommand {
        sourceManifest = sourceManifest == null ? null : List.copyOf(sourceManifest);
    }
}
