package com.auralis.app.ai;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.UUID;

public record OverviewSourceManifestEntry(
        @NotNull UUID sourceId,
        @NotNull UUID ingestionRevision,
        @PositiveOrZero Long outlineVersion,
        @PositiveOrZero Long summaryVersion) {
}
