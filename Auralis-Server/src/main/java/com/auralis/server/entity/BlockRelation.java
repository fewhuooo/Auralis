package com.auralis.server.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("block_relations")
public class BlockRelation {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String sourceId;
    private String targetId;
    private String relationType;
}
