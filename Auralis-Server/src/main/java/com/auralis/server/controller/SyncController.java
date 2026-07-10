package com.auralis.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.auralis.server.common.Result;
import com.auralis.server.common.UserContext;
import com.auralis.server.dto.SyncPullResponse;
import com.auralis.server.entity.KnowledgeBlock;
import com.auralis.server.entity.MutationLog;
import com.auralis.server.entity.TaskBlock;
import com.auralis.server.service.KnowledgeBlockService;
import com.auralis.server.service.MutationLogService;
import com.auralis.server.service.TaskBlockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/sync")
@RequiredArgsConstructor
@Slf4j
public class SyncController {

    private final MutationLogService mutationLogService;
    private final KnowledgeBlockService knowledgeBlockService;
    private final TaskBlockService taskBlockService;

    @GetMapping("/pull")
    public Result<SyncPullResponse> pull(@RequestParam(defaultValue = "0") Long afterId) {
        String userId = UserContext.getCurrentUserId();
        log.info("[SyncController] Pulling mutations for user: {}, since mutation ID: {}", userId, afterId);

        SyncPullResponse response = new SyncPullResponse();
        response.setTruncated(false);
        response.setMutations(new ArrayList<>());
        response.setBlocks(new ArrayList<>());
        response.setTasks(new ArrayList<>());
        response.setLastMutationId(afterId);

        // 1. Sliding Window Truncation Check
        if (afterId == 0) {
            response.setTruncated(true);
        } else {
            LambdaQueryWrapper<MutationLog> minWrapper = new LambdaQueryWrapper<>();
            minWrapper.eq(MutationLog::getUserId, userId);
            minWrapper.orderByAsc(MutationLog::getId);
            minWrapper.last("LIMIT 1");
            MutationLog oldestMutation = mutationLogService.getOne(minWrapper);

            if (oldestMutation != null && oldestMutation.getId() > (afterId + 1)) {
                log.warn("[SyncController] Sliding window gap detected! Client afterId: {}, Oldest server ID: {}. Triggering cold start...",
                        afterId, oldestMutation.getId());
                response.setTruncated(true);
            }
        }

        // 2. Fetch data based on cold start (truncated) or incremental pull
        if (response.getTruncated()) {
            // Cold start: Pull all active entities
            LambdaQueryWrapper<KnowledgeBlock> blockWrapper = new LambdaQueryWrapper<>();
            blockWrapper.eq(KnowledgeBlock::getUserId, userId);
            blockWrapper.and(w -> w.eq(KnowledgeBlock::getIsDeleted, false).or().isNull(KnowledgeBlock::getIsDeleted));
            List<KnowledgeBlock> activeBlocks = knowledgeBlockService.list(blockWrapper);
            response.setBlocks(activeBlocks);

            LambdaQueryWrapper<TaskBlock> taskWrapper = new LambdaQueryWrapper<>();
            taskWrapper.eq(TaskBlock::getUserId, userId);
            taskWrapper.and(w -> w.eq(TaskBlock::getIsDeleted, false).or().isNull(TaskBlock::getIsDeleted));
            List<TaskBlock> activeTasks = taskBlockService.list(taskWrapper);
            response.setTasks(activeTasks);

            // Get current max mutation ID to position client cursor
            LambdaQueryWrapper<MutationLog> maxWrapper = new LambdaQueryWrapper<>();
            maxWrapper.eq(MutationLog::getUserId, userId);
            maxWrapper.orderByDesc(MutationLog::getId);
            maxWrapper.last("LIMIT 1");
            MutationLog newestMutation = mutationLogService.getOne(maxWrapper);
            response.setLastMutationId(newestMutation != null ? newestMutation.getId() : 0L);
        } else {
            // Incremental pull: Pull all mutations since afterId
            LambdaQueryWrapper<MutationLog> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(MutationLog::getUserId, userId);
            wrapper.gt(MutationLog::getId, afterId);
            wrapper.orderByAsc(MutationLog::getId);
            List<MutationLog> mutations = mutationLogService.list(wrapper);
            response.setMutations(mutations);

            if (!mutations.isEmpty()) {
                response.setLastMutationId(mutations.get(mutations.size() - 1).getId());
            }
        }

        return Result.success(response);
    }

    @PostMapping("/push")
    public Result<List<Long>> push(@RequestBody List<MutationLog> mutations) {
        String userId = UserContext.getCurrentUserId();
        log.info("[SyncController] Pushing {} mutations for user: {}", mutations.size(), userId);

        List<Long> successIds = new ArrayList<>();
        for (MutationLog mutation : mutations) {
            try {
                // Secure user isolation
                mutation.setUserId(userId);
                if (mutation.getCreatedAt() == null) {
                    mutation.setCreatedAt(System.currentTimeMillis());
                }
                mutationLogService.applyMutation(mutation);
                successIds.add(mutation.getId());
            } catch (Exception e) {
                log.error("[SyncController] Failed to apply mutation on entity " + mutation.getEntityId(), e);
            }
        }

        // Asynchronously clean up old mutations (30 days window)
        mutationLogService.cleanOldMutations(30);

        return Result.success(successIds);
    }
}
