package com.auralis.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.auralis.server.common.UserContext;
import com.auralis.server.entity.Asset;
import com.auralis.server.mapper.AssetMapper;
import com.auralis.server.service.AssetService;
import com.auralis.server.service.DocumentIngestionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * 15.7 Asset Service Implementation
 * Handles asset metadata persistence and Redis Stream ingestion task dispatch.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AssetServiceImpl extends ServiceImpl<AssetMapper, Asset> implements AssetService {

    private final RedisTemplate<String, Object> redisTemplate;

    /**
     * Bind a direct-uploaded file: save metadata to PostgreSQL and dispatch to Redis Stream.
     */
    @Transactional(rollbackFor = Exception.class)
    public Asset bindAndDispatch(String objectName, String fileName, Long fileSize, 
                                  String contentType, String subject) {
        String userId = UserContext.getCurrentUserId();
        if (userId == null || userId.isBlank()) {
            throw new IllegalStateException("User is not authenticated");
        }
        if (objectName == null || !objectName.startsWith(userId + "/")) {
            throw new IllegalArgumentException("Object does not belong to current user");
        }
        if (fileSize != null && fileSize < 0) {
            throw new IllegalArgumentException("Invalid file size");
        }

        // Step 1: Persist asset metadata to PostgreSQL
        Asset asset = new Asset();
        asset.setUserId(userId);
        asset.setFileName(fileName);
        asset.setObjectName(objectName);
        asset.setFileSize(fileSize);
        asset.setContentType(contentType);
        asset.setSubject(subject != null ? subject : "文档导入");
        asset.setStatus("PENDING");
        asset.setCreatedAt(System.currentTimeMillis());
        save(asset);

        log.info("[Asset] Bound asset: {} (object: {}, size: {} bytes)", asset.getId(), objectName, fileSize);

        // Step 2: Dispatch to Redis Stream for background processing
        Map<String, String> payload = new HashMap<>();
        payload.put("assetId", asset.getId());
        payload.put("userId", asset.getUserId());
        payload.put("objectName", objectName);
        payload.put("fileName", fileName);
        payload.put("subject", asset.getSubject());
        payload.put("mode", "MINIO_FILE");  // Indicates this is a MinIO-backed file task
        payload.put("retryCount", "0");

        try {
            redisTemplate.opsForStream().add(DocumentIngestionService.INGEST_STREAM_KEY, payload);
            log.info("[Asset] Dispatched ingestion task for asset {} to Redis Stream", asset.getId());
        } catch (Exception e) {
            log.error("[Asset] Failed to dispatch ingestion task for asset {}", asset.getId(), e);
            asset.setStatus("FAILED");
            updateById(asset);
        }

        return asset;
    }
}
