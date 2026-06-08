package com.studycore.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.studycore.server.config.PgJsonbTypeHandler;
import lombok.Data;

@Data
@TableName(value = "mutation_log", autoResultMap = true)
public class MutationLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String clientId;
    private String userId;
    private String entityType;
    private String entityId;
    private String action;
    
    @TableField(typeHandler = PgJsonbTypeHandler.class)
    private Object payload;
    
    private Long createdAt;
}
