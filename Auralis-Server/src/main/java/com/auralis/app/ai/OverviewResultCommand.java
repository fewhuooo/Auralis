package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Positive;

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
        @Schema(nullable = true, types = {"object", "null"}) @Valid OutlineIdentityInput outlineIdentity,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(nullable = true, types = {"object", "null"}) @Valid OutlineProvenanceInput outlineProvenance,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(nullable = true, types = {"object", "null"}) @Valid OverviewInputDescriptor inputDescriptor,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(nullable = true, types = {"object", "null"}) @Valid CandidateInput candidateInput) {
    public record CandidateInput(@NotNull UUID jobId, @NotNull @Positive Integer jobVersion) { }

    public OverviewResultCommand(Long baseVersion, UUID clientWriteId, OverviewMode mode,
                                 UUID ingestionRevision, List<OverviewSourceManifestEntry> sourceManifest,
                                 String inputFingerprint, Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                                 OverviewResponse result, OutlineIdentityInput outlineIdentity,
                                 OutlineProvenanceInput outlineProvenance, OverviewInputDescriptor inputDescriptor) {
        this(baseVersion, clientWriteId, mode, ingestionRevision, sourceManifest, inputFingerprint,
                outlineGeneratedAt, summaryGeneratedAt, result, outlineIdentity, outlineProvenance,
                inputDescriptor, null);
    }

    public OverviewResultCommand(Long baseVersion, UUID clientWriteId, OverviewMode mode,
                                 UUID ingestionRevision, List<OverviewSourceManifestEntry> sourceManifest,
                                 String inputFingerprint, Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                                 OverviewResponse result, OutlineIdentityInput outlineIdentity,
                                 OutlineProvenanceInput outlineProvenance) {
        this(baseVersion, clientWriteId, mode, ingestionRevision, sourceManifest, inputFingerprint,
                outlineGeneratedAt, summaryGeneratedAt, result, outlineIdentity, outlineProvenance, null, null);
    }

    public OverviewResultCommand(Long baseVersion, UUID clientWriteId, OverviewMode mode,
                                 UUID ingestionRevision, List<OverviewSourceManifestEntry> sourceManifest,
                                 String inputFingerprint, Instant outlineGeneratedAt, Instant summaryGeneratedAt,
                                 OverviewResponse result) {
        this(baseVersion, clientWriteId, mode, ingestionRevision, sourceManifest, inputFingerprint,
                outlineGeneratedAt, summaryGeneratedAt, result, null, null, null, null);
    }

    public OverviewResultCommand {
        sourceManifest = sourceManifest == null ? null : List.copyOf(sourceManifest);
    }
}
