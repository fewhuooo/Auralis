package com.studycore.server.dto;

import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.entity.TaskBlock;
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
