package com.auralis.server.dto;

import com.auralis.server.entity.KnowledgeBlock;
import com.auralis.server.entity.TaskBlock;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SyncPushRequest {
    private List<KnowledgeBlock> blocks;
    private List<TaskBlock> tasks;
}
