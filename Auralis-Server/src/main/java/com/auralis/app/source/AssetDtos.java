package com.auralis.app.source;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class AssetDtos {

    private AssetDtos() {
    }

    @Schema(name = "AssetUploadIntentRequest")
    public record UploadIntentRequest(
            @NotNull Long baseVersion,
            @NotNull UUID clientImportId,
            @NotBlank @Size(max = 255) String originalName,
            @Positive long sizeBytes,
            @NotBlank @Size(max = 128) String mimeType,
            @Size(min = 64, max = 64) String sha256) {
        AssetUploadIntentCommand command() {
            return new AssetUploadIntentCommand(
                    baseVersion, clientImportId, originalName, sizeBytes, mimeType, sha256);
        }
    }

    @Schema(name = "AssetUploadIntentResponse")
    public record UploadIntentResponse(
            UUID assetId,
            String uploadUrl,
            Map<String, String> headers,
            Instant expiresAt,
            AssetUploadStatus uploadStatus) {
        static UploadIntentResponse from(AssetUploadIntentView view) {
            return new UploadIntentResponse(
                    view.assetId(), view.uploadUrl(), view.headers(), view.expiresAt(), view.uploadStatus());
        }
    }

    @Schema(name = "AssetResponse")
    public record Response(
            UUID id,
            String originalName,
            long sizeBytes,
            String mimeType,
            String sha256,
            AssetUploadStatus uploadStatus,
            Instant completedAt,
            Instant createdAt,
            Instant updatedAt) {
        static Response from(AssetView view) {
            return new Response(view.id(), view.originalName(), view.sizeBytes(), view.mimeType(), view.sha256(),
                    view.uploadStatus(), view.completedAt(), view.createdAt(), view.updatedAt());
        }
    }

    @Schema(name = "AssetDownloadUrlResponse")
    public record DownloadUrlResponse(
            String url,
            Instant expiresAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String originalName,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String mimeType) {
        static DownloadUrlResponse from(AssetDownloadUrlView view) {
            return new DownloadUrlResponse(view.url(), view.expiresAt(), view.originalName(), view.mimeType());
        }
    }
}
