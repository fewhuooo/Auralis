package com.studycore.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 15.7 Asset Entity
 * Tracks file metadata for documents uploaded via MinIO presigned URL direct-upload.
 */
@Data
@TableName("asset")
public class Asset {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String userId;
    private String fileName;
    private String objectName;
    private Long fileSize;
    private String contentType;
    /** PENDING → PROCESSING → COMPLETED / FAILED */
    private String status;
    private String subject;
    private Long createdAt;
}
