package com.studycore.server.controller;

import com.studycore.server.common.Result;
import com.studycore.server.entity.Asset;
import com.studycore.server.service.impl.AssetServiceImpl;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 15.7 Asset Controller
 * Handles asset binding after direct MinIO upload completes.
 */
@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetServiceImpl assetService;

    @Data
    public static class BindRequest {
        private String objectName;
        private String fileName;
        private Long fileSize;
        private String contentType;
        private String subject;
    }

    /**
     * POST /api/assets/bind
     * Called by frontend after successful MinIO direct upload.
     * Records metadata in PostgreSQL and dispatches ingestion task to Redis Stream.
     */
    @PostMapping("/bind")
    public Result<Asset> bindAsset(@RequestBody BindRequest req) {
        if (req.getObjectName() == null || req.getObjectName().isBlank()) {
            throw new IllegalArgumentException("objectName 不能为空");
        }
        if (req.getFileName() == null || req.getFileName().isBlank()) {
            throw new IllegalArgumentException("fileName 不能为空");
        }

        Asset asset = assetService.bindAndDispatch(
                req.getObjectName(),
                req.getFileName(),
                req.getFileSize(),
                req.getContentType(),
                req.getSubject()
        );

        return Result.success(asset);
    }

    /**
     * GET /api/assets/{id}
     * Query asset processing status.
     */
    @GetMapping("/{id}")
    public Result<Asset> getAsset(@PathVariable String id) {
        Asset asset = assetService.getById(id);
        if (asset == null) {
            throw new IllegalArgumentException("资产不存在: " + id);
        }
        return Result.success(asset);
    }
}
