package com.studycore.server.controller;

import com.studycore.server.common.Result;
import com.studycore.server.common.UserContext;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 15.7 File Storage Controller
 * Generates MinIO presigned URLs for direct client-side file upload.
 * Files bypass Spring Boot memory — uploaded directly to object storage.
 */
@Slf4j
@RestController
@RequestMapping("/api/fs")
@RequiredArgsConstructor
public class FileStorageController {

    private final MinioClient minioClient;

    @Value("${minio.bucket:studycore-assets}")
    private String bucket;

    @Value("${studycore.ingest.max-file-size-mb:50}")
    private int maxFileSizeMb;

    /**
     * GET /api/fs/presigned-url?fileName=xxx&contentType=application/pdf
     * Returns a 15-minute presigned PUT URL for the client to upload directly to MinIO.
     */
    @GetMapping("/presigned-url")
    public Result<Map<String, Object>> getPresignedUrl(
            @RequestParam String fileName,
            @RequestParam(defaultValue = "application/octet-stream") String contentType) {

        String userId = UserContext.getCurrentUserId();
        if (userId == null) {
            userId = "anonymous";
        }

        // Generate unique object name: {userId}/{UUID}_{originalFileName}
        String objectName = userId + "/" + UUID.randomUUID() + "_" + sanitizeFileName(fileName);

        try {
            String presignedUrl = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucket)
                            .object(objectName)
                            .expiry(15, TimeUnit.MINUTES)
                            .build()
            );

            log.info("[FileStorage] Generated presigned URL for user={}, object={}", userId, objectName);

            return Result.success(Map.of(
                    "presignedUrl", presignedUrl,
                    "objectName", objectName,
                    "bucket", bucket,
                    "maxFileSizeMb", maxFileSizeMb,
                    "expiresInMinutes", 15
            ));
        } catch (Exception e) {
            log.error("[FileStorage] Failed to generate presigned URL", e);
            throw new RuntimeException("无法生成上传凭证，请检查 MinIO 服务是否可用");
        }
    }

    /**
     * Sanitize file name to prevent path traversal attacks.
     */
    private String sanitizeFileName(String fileName) {
        if (fileName == null) return "unknown";
        return fileName.replaceAll("[^a-zA-Z0-9._\\-\\u4e00-\\u9fff]", "_");
    }
}
