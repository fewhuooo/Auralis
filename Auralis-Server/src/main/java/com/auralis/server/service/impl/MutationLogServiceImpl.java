package com.auralis.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.server.entity.KnowledgeBlock;
import com.auralis.server.entity.MutationLog;
import com.auralis.server.entity.TaskBlock;
import com.auralis.server.mapper.MutationLogMapper;
import com.auralis.server.service.KnowledgeBlockService;
import com.auralis.server.service.MutationLogService;
import com.auralis.server.service.TaskBlockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class MutationLogServiceImpl extends ServiceImpl<MutationLogMapper, MutationLog> implements MutationLogService {

    private final KnowledgeBlockService knowledgeBlockService;
    private final TaskBlockService taskBlockService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void applyMutation(MutationLog mutation) {
        log.info("[MutationLog] Applying mutation: id={}, client={}, action={}, entity={}/{}",
                mutation.getId(), mutation.getClientId(), mutation.getAction(),
                mutation.getEntityType(), mutation.getEntityId());

        // First, save the mutation to PostgreSQL mutation_log
        super.save(mutation);

        String entityType = mutation.getEntityType();
        String action = mutation.getAction();

        if ("block".equalsIgnoreCase(entityType)) {
            if ("create".equalsIgnoreCase(action) || "update".equalsIgnoreCase(action)) {
                KnowledgeBlock block = objectMapper.convertValue(mutation.getPayload(), KnowledgeBlock.class);
                block.setId(mutation.getEntityId());
                block.setUserId(mutation.getUserId());
                block.setSyncVersion(mutation.getCreatedAt());
                block.setIsDeleted(false);
                knowledgeBlockService.saveOrUpdate(block);
            } else if ("delete".equalsIgnoreCase(action)) {
                KnowledgeBlock block = knowledgeBlockService.getById(mutation.getEntityId());
                if (block != null && mutation.getUserId().equals(block.getUserId())) {
                    block.setSyncVersion(mutation.getCreatedAt());
                    block.setIsDeleted(true);
                    knowledgeBlockService.updateById(block);
                }
            }
        } else if ("task".equalsIgnoreCase(entityType)) {
            if ("create".equalsIgnoreCase(action) || "update".equalsIgnoreCase(action)) {
                TaskBlock task = objectMapper.convertValue(mutation.getPayload(), TaskBlock.class);
                task.setId(mutation.getEntityId());
                task.setUserId(mutation.getUserId());
                task.setSyncVersion(mutation.getCreatedAt());
                task.setIsDeleted(false);
                taskBlockService.saveOrUpdate(task);
            } else if ("delete".equalsIgnoreCase(action)) {
                TaskBlock task = taskBlockService.getById(mutation.getEntityId());
                if (task != null && mutation.getUserId().equals(task.getUserId())) {
                    task.setSyncVersion(mutation.getCreatedAt());
                    task.setIsDeleted(true);
                    taskBlockService.updateById(task);
                }
            }
        }
    }

    @Async
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cleanOldMutations(long days) {
        long limitTime = System.currentTimeMillis() - (days * 24 * 60 * 60 * 1000L);
        log.info("[MutationLog] Running sliding window cleanup. Deleting mutations older than: {} ({} days ago)", limitTime, days);
        LambdaQueryWrapper<MutationLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.lt(MutationLog::getCreatedAt, limitTime);
        int deleted = super.baseMapper.delete(wrapper);
        log.info("[MutationLog] Cleaned up {} expired mutation logs.", deleted);
    }
}
