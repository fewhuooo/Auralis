package com.studycore.server.dto;

import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.entity.MutationLog;
import com.studycore.server.entity.TaskBlock;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SyncPullResponse {
    private List<MutationLog> mutations;
    private Boolean truncated;
    private List<KnowledgeBlock> blocks;
    private List<TaskBlock> tasks;
    private Long lastMutationId;
}
