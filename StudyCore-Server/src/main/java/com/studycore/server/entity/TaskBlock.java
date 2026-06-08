package com.studycore.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("task_block")
public class TaskBlock {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String name;
    private String subject;
    @TableField("\"desc\"")
    private String desc;
    private String color;
    private Integer duration;
    private String load;
    private String loadText;
    private String status;
    private String startTime;
    private String userId;
    private Long syncVersion;
    private Boolean isDeleted;
    private String encryptedPayload;
}
