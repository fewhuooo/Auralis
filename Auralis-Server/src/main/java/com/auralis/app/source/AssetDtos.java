package com.auralis.app.source;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class AssetDtos {

    private AssetDtos() {
    }

    public record UploadIntentRequest(
            @NotNull Long baseVersion,
            @NotBlank @Size(max = 255) String originalName,
            @Positive long sizeBytes,
            @NotBlank @Size(max = 128) String mimeType,
            @Size(min = 64, max = 64) String sha256) {
        AssetUploadIntentCommand command() {
            return new AssetUploadIntentCommand(baseVersion, originalName, sizeBytes, mimeType, sha256);
        }
    }

    public record UploadIntentResponse(
            UUID assetId,
            String uploadUrl,
            Map<String, String> headers,
            Instant expiresAt) {
        static UploadIntentResponse from(AssetUploadIntentView view) {
            return new UploadIntentResponse(view.assetId(), view.uploadUrl(), view.headers(), view.expiresAt());
        }
    }

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

    public record DownloadUrlResponse(String url, Instant expiresAt) {
        static DownloadUrlResponse from(AssetDownloadUrlView view) {
            return new DownloadUrlResponse(view.url(), view.expiresAt());
        }
    }
}
