package com.studycore.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("knowledge_block")
public class KnowledgeBlock {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String subject;
    private String title;
    private String preview;
    private String time;
    private String source;
    private String color;
    private String userId;
    private Long syncVersion;
    private Boolean isDeleted;
    private String encryptedPayload;
}
