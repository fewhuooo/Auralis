package com.studycore.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.studycore.server.common.SyncEvent;
import com.studycore.server.config.RedisConfig;
import com.studycore.server.entity.TaskBlock;
import com.studycore.server.mapper.TaskBlockMapper;
import com.studycore.server.service.TaskBlockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.io.Serializable;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskBlockServiceImpl extends ServiceImpl<TaskBlockMapper, TaskBlock> implements TaskBlockService {

    private final RedisTemplate<String, Object> redisTemplate;

    @Override
    public boolean save(TaskBlock entity) {
        entity.setSyncVersion(System.currentTimeMillis());
        if (entity.getIsDeleted() == null) {
            entity.setIsDeleted(false);
        }
        boolean success = super.save(entity);
        if (success) {
            publishEvent("task_created", entity);
        }
        return success;
    }

    @Override
    public boolean updateById(TaskBlock entity) {
        entity.setSyncVersion(System.currentTimeMillis());
        boolean success = super.updateById(entity);
        if (success) {
            publishEvent("task_updated", entity);
        }
        return success;
    }

    @Override
    public boolean removeById(Serializable id) {
        TaskBlock entity = super.getById(id);
        if (entity == null) {
            return false;
        }
        entity.setIsDeleted(true);
        entity.setSyncVersion(System.currentTimeMillis());
        boolean success = super.updateById(entity);
        if (success) {
            publishDeleteEvent(id.toString());
        }
        return success;
    }

    private void publishEvent(String type, TaskBlock entity) {
        SyncEvent event = SyncEvent.of(type, "tasks", entity.getId(), null);
        redisTemplate.convertAndSend(RedisConfig.SYNC_CHANNEL, event);
        log.debug("[Sync] Published lightweight event: {} for task {}", type, entity.getId());
    }

    private void publishDeleteEvent(String id) {
        SyncEvent event = SyncEvent.of("task_deleted", "tasks", id, null);
        redisTemplate.convertAndSend(RedisConfig.SYNC_CHANNEL, event);
        log.debug("[Sync] Published event: task_deleted for id {}", id);
    }
}

