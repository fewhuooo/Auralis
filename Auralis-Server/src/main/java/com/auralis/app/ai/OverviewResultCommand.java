package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
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
        @NotNull @Valid OverviewResponse result,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(nullable = true, types = {"object", "null"}) @Valid OverviewInputDescriptor inputDescriptor) {

    public OverviewResultCommand(Long baseVersion, UUID clientWriteId, OverviewMode mode,
                                 UUID ingestionRevision, List<OverviewSourceManifestEntry> sourceManifest,
                                 String inputFingerprint, Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                                 OverviewResponse result) {
        this(baseVersion, clientWriteId, mode, ingestionRevision, sourceManifest, inputFingerprint,
                outlineGeneratedAt, summaryGeneratedAt, result, null);
    }

    public OverviewResultCommand {
        sourceManifest = sourceManifest == null ? null : List.copyOf(sourceManifest);
    }
}
