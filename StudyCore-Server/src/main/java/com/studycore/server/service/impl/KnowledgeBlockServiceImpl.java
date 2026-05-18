package com.studycore.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studycore.server.common.SyncEvent;
import com.studycore.server.config.RedisConfig;
import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.mapper.KnowledgeBlockMapper;
import com.studycore.server.service.KnowledgeBlockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.io.Serializable;

import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeBlockServiceImpl extends ServiceImpl<KnowledgeBlockMapper, KnowledgeBlock> implements KnowledgeBlockService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean save(KnowledgeBlock entity) {
        boolean success = super.save(entity);
        if (success) {
            publishEvent("block_created", entity);
        }
        return success;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateById(KnowledgeBlock entity) {
        boolean success = super.updateById(entity);
        if (success) {
            publishEvent("block_updated", entity);
        }
        return success;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeById(Serializable id) {
        boolean success = super.removeById(id);
        if (success) {
            publishDeleteEvent(id.toString());
        }
        return success;
    }

    private void publishEvent(String type, KnowledgeBlock entity) {
        try {
            String data = objectMapper.writeValueAsString(entity);
            SyncEvent event = SyncEvent.of(type, "blocks", entity.getId(), data);
            redisTemplate.convertAndSend(RedisConfig.SYNC_CHANNEL, event);
            log.debug("[Sync] Published event: {} for block {}", type, entity.getId());
        } catch (Exception e) {
            log.error("[Sync] Failed to publish event", e);
        }
    }

    private void publishDeleteEvent(String id) {
        SyncEvent event = SyncEvent.of("block_deleted", "blocks", id, null);
        redisTemplate.convertAndSend(RedisConfig.SYNC_CHANNEL, event);
        log.debug("[Sync] Published event: block_deleted for id {}", id);
    }
}
