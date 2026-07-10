package com.auralis.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.server.common.SyncEvent;
import com.auralis.server.config.RedisConfig;
import com.auralis.server.entity.KnowledgeBlock;
import com.auralis.server.mapper.KnowledgeBlockMapper;
import com.auralis.server.service.KnowledgeBlockService;
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
    private final dev.langchain4j.store.embedding.EmbeddingStore<dev.langchain4j.data.segment.TextSegment> embeddingStore;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean save(KnowledgeBlock entity) {
        entity.setSyncVersion(System.currentTimeMillis());
        if (entity.getIsDeleted() == null) {
            entity.setIsDeleted(false);
        }
        boolean success = super.save(entity);
        if (success) {
            publishEvent("block_created", entity);
        }
        return success;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateById(KnowledgeBlock entity) {
        entity.setSyncVersion(System.currentTimeMillis());
        boolean success = super.updateById(entity);
        if (success) {
            publishEvent("block_updated", entity);
        }
        return success;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeById(Serializable id) {
        KnowledgeBlock entity = super.getById(id);
        if (entity == null) {
            return false;
        }
        entity.setIsDeleted(true);
        entity.setSyncVersion(System.currentTimeMillis());
        boolean success = super.updateById(entity);
        if (success) {
            try {
                embeddingStore.remove(id.toString());
                log.info("[VectorDB] Cascade deleted vector for block: {}", id);
            } catch (Exception e) {
                log.warn("[VectorDB] Failed to delete vector for block: {}. It might not have a vector index.", id, e);
            }
            publishDeleteEvent(id.toString());
        }
        return success;
    }

    private void publishEvent(String type, KnowledgeBlock entity) {
        try {
            // Only send ID - client pulls full (possibly encrypted) data via REST API
            java.util.Map<String, String> lightEntity = new java.util.HashMap<>();
            lightEntity.put("id", entity.getId());
            String data = objectMapper.writeValueAsString(lightEntity);

            SyncEvent event = SyncEvent.of(type, "blocks", entity.getId(), data);
            redisTemplate.convertAndSend(RedisConfig.SYNC_CHANNEL, event);
            log.debug("[Sync] Published lightweight event: {} for block {}", type, entity.getId());
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

