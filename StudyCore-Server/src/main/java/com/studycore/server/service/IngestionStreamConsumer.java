package com.studycore.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studycore.server.common.SyncEvent;
import com.studycore.server.common.UserContext;
import com.studycore.server.entity.Asset;
import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.entity.MutationLog;
import com.studycore.server.websocket.SyncWebSocketHandler;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentParser;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.stream.*;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 15.7 Enhanced Ingestion Stream Consumer
 *
 * Supports two ingestion modes:
 *   - TEXT mode (legacy): text content embedded in Redis Stream payload
 *   - MINIO_FILE mode (15.7): download file from MinIO → Tika parse → split → embed
 *
 * Includes:
 *   - DLQ (Dead Letter Queue) for fatal failures
 *   - Retry mechanism (max 3 attempts) for transient errors (429 rate limit)
 *   - Token Bucket rate limiter for cloud Embedding API QPS control
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IngestionStreamConsumer implements InitializingBean {

    public static final String INGEST_STREAM_KEY = "studycore:ingest_stream";
    public static final String INGEST_DLQ_KEY = "studycore:ingest_dlq";
    public static final String INGEST_GROUP_NAME = "studycore_group";
    public static final String INGEST_CONSUMER_NAME = "consumer_1";
    private static final int MAX_RETRY_COUNT = 3;

    private final RedisTemplate<String, Object> redisTemplate;
    private final EmbeddingModel embeddingModel;
    private final EmbeddingStore<TextSegment> embeddingStore;
    private final MutationLogService mutationLogService;
    private final AssetService assetService;
    private final SyncWebSocketHandler webSocketHandler;
    private final MinioClient minioClient;
    private final DocumentParser documentParser;
    private final DocumentSplitter documentSplitter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${minio.bucket:studycore-assets}")
    private String minioBucket;

    // Bounded QPS rate limiter: 5 tokens capacity, refill 3 tokens per second
    private final TokenBucketRateLimiter rateLimiter = new TokenBucketRateLimiter(5.0, 3.0);
    private final ExecutorService executorService = Executors.newVirtualThreadPerTaskExecutor();

    @Override
    public void afterPropertiesSet() {
        // Create Redis Stream Consumer Group if it doesn't exist
        try {
            redisTemplate.opsForStream().createGroup(INGEST_STREAM_KEY, ReadOffset.from("0"), INGEST_GROUP_NAME);
            log.info("[RedisStream] Ingestion Consumer Group created successfully");
        } catch (Exception e) {
            log.debug("[RedisStream] Consumer Group already exists or Stream not initialized yet");
        }

        // Start processing loop
        executorService.submit(this::processStreamLoop);
    }

    @SuppressWarnings("unchecked")
    private void processStreamLoop() {
        log.info("[RedisStream] Ingestion consumer loop started (with DLQ support)");
        while (!Thread.currentThread().isInterrupted()) {
            try {
                // batchSize=1 to prevent concurrent OOM (15.7 requirement)
                List<MapRecord<String, Object, Object>> records = redisTemplate.opsForStream().read(
                        Consumer.from(INGEST_GROUP_NAME, INGEST_CONSUMER_NAME),
                        StreamReadOptions.empty().block(Duration.ofSeconds(2)).count(1),
                        StreamOffset.create(INGEST_STREAM_KEY, ReadOffset.lastConsumed())
                );

                if (records == null || records.isEmpty()) {
                    continue;
                }

                for (MapRecord<String, Object, Object> record : records) {
                    Map<Object, Object> map = record.getValue();
                    try {
                        rateLimiter.acquire();
                        processRecord(map);
                        // ACK on success
                        redisTemplate.opsForStream().acknowledge(INGEST_STREAM_KEY, INGEST_GROUP_NAME, record.getId());
                    } catch (RateLimitException rle) {
                        // 429 rate limit — do NOT ACK, let Redis redeliver
                        int retryCount = parseRetryCount(map);
                        if (retryCount >= MAX_RETRY_COUNT) {
                            log.error("[RedisStream] Max retries exceeded for record {}. Moving to DLQ.", record.getId());
                            moveToDlq(map, "MAX_RETRIES_EXCEEDED: " + rle.getMessage());
                            redisTemplate.opsForStream().acknowledge(INGEST_STREAM_KEY, INGEST_GROUP_NAME, record.getId());
                        } else {
                            log.warn("[RedisStream] Rate limited (attempt {}), will retry record {}", retryCount + 1, record.getId());
                            // Re-enqueue with incremented retry count
                            reenqueueWithRetry(map, retryCount + 1);
                            redisTemplate.opsForStream().acknowledge(INGEST_STREAM_KEY, INGEST_GROUP_NAME, record.getId());
                            // Backoff before next attempt
                            Thread.sleep(2000L * (retryCount + 1));
                        }
                    } catch (Exception ex) {
                        log.error("[RedisStream] Fatal error processing record {}: {}", record.getId(), ex.getMessage(), ex);
                        moveToDlq(map, ex.getClass().getSimpleName() + ": " + ex.getMessage());
                        redisTemplate.opsForStream().acknowledge(INGEST_STREAM_KEY, INGEST_GROUP_NAME, record.getId());
                        // Notify frontend of failure
                        notifyFailed(map, ex.getMessage());
                    }
                }
            } catch (Exception e) {
                log.error("[RedisStream] Connection or read error in consumer loop", e);
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    private void processRecord(Map<Object, Object> map) throws Exception {
        String mode = getStringValue(map, "mode");

        if ("MINIO_FILE".equals(mode)) {
            processMinioFileRecord(map);
        } else {
            processTextRecord(map);
        }
    }

    /**
     * 15.7 NEW: Process a MinIO-backed file ingestion task.
     * Downloads file from MinIO → parses with Tika → splits → embeds → saves.
     */
    private void processMinioFileRecord(Map<Object, Object> map) throws Exception {
        String userId = getStringValue(map, "userId");
        String objectName = getStringValue(map, "objectName");
        String fileName = getStringValue(map, "fileName");
        String subject = getStringValue(map, "subject");
        String assetId = getStringValue(map, "assetId");

        try {
            UserContext.setCurrentUserId(userId);

            log.info("[RedisStream] Processing MinIO file: {} for user: {}", objectName, userId);

            // Update asset status to PROCESSING
            if (assetId != null) {
                updateAssetStatus(assetId, "PROCESSING");
            }

            // Step 1: Download file from MinIO
            InputStream inputStream = minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(minioBucket)
                            .object(objectName)
                            .build()
            );

            // Step 2: Parse with Tika
            Document document = documentParser.parse(inputStream);
            document.metadata().put("source", fileName);
            inputStream.close();

            // Step 3: Split into segments
            List<TextSegment> segments = documentSplitter.split(document);
            log.info("[RedisStream] MinIO file split into {} segments", segments.size());

            // Step 4: Embed and store each segment
            for (int i = 0; i < segments.size(); i++) {
                rateLimiter.acquire();
                TextSegment seg = segments.get(i);

                // Check for rate limit response from embedding API
                Embedding embedding;
                try {
                    embedding = embeddingModel.embed(seg).content();
                } catch (Exception e) {
                    if (isRateLimitError(e)) {
                        throw new RateLimitException("Embedding API 429: " + e.getMessage());
                    }
                    throw e;
                }

                // Save to PostgreSQL via MutationLog for offline synchronization
                String blockId = java.util.UUID.randomUUID().toString();
                KnowledgeBlock block = new KnowledgeBlock();
                block.setId(blockId);
                block.setSubject(subject != null ? subject : "文档导入");
                block.setTitle(truncate(seg.text(), 50));
                block.setPreview(truncate(seg.text(), 200));
                block.setTime(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
                block.setSource(fileName);
                block.setColor("rgba(99, 102, 241, 0.2)");
                block.setUserId(userId);

                MutationLog mutation = new MutationLog();
                mutation.setClientId("server_ingest");
                mutation.setUserId(userId);
                mutation.setEntityType("block");
                mutation.setEntityId(blockId);
                mutation.setAction("create");
                mutation.setPayload(block);
                mutation.setCreatedAt(System.currentTimeMillis());

                mutationLogService.applyMutation(mutation);

                // Save to Milvus
                embeddingStore.addAll(List.of(block.getId()), List.of(embedding), List.of(seg));

                log.debug("[RedisStream] Ingested segment {}/{} for file {}", i + 1, segments.size(), fileName);
            }

            // Update asset status to COMPLETED
            if (assetId != null) {
                updateAssetStatus(assetId, "COMPLETED");
            }

            // Broadcast completion
            notifyIngested(userId, assetId != null ? assetId : objectName, segments.size());

        } finally {
            UserContext.clear();
        }
    }

    /**
     * Legacy: Process a text-content ingestion task (inline text in Stream payload).
     */
    private void processTextRecord(Map<Object, Object> map) throws Exception {
        String userId = getStringValue(map, "userId");
        String text = getStringValue(map, "text");
        String source = getStringValue(map, "source");
        String subject = getStringValue(map, "subject");

        if (text == null || text.trim().isEmpty()) {
            return;
        }

        try {
            UserContext.setCurrentUserId(userId);

            log.info("[RedisStream] Processing text segment for user: {}, source: {}", userId, source);

            TextSegment textSegment = TextSegment.from(text);

            Embedding embedding;
            try {
                embedding = embeddingModel.embed(textSegment).content();
            } catch (Exception e) {
                if (isRateLimitError(e)) {
                    throw new RateLimitException("Embedding API 429: " + e.getMessage());
                }
                throw e;
            }

            String blockId = java.util.UUID.randomUUID().toString();
            KnowledgeBlock block = new KnowledgeBlock();
            block.setId(blockId);
            block.setSubject(subject != null ? subject : "文档导入");
            block.setTitle(truncate(text, 50));
            block.setPreview(truncate(text, 200));
            block.setTime(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
            block.setSource(source);
            block.setColor("rgba(99, 102, 241, 0.2)");
            block.setUserId(userId);

            MutationLog mutation = new MutationLog();
            mutation.setClientId("server_ingest");
            mutation.setUserId(userId);
            mutation.setEntityType("block");
            mutation.setEntityId(blockId);
            mutation.setAction("create");
            mutation.setPayload(block);
            mutation.setCreatedAt(System.currentTimeMillis());

            mutationLogService.applyMutation(mutation);

            embeddingStore.addAll(List.of(block.getId()), List.of(embedding), List.of(textSegment));

            notifyIngested(userId, block.getId(), 1);

        } finally {
            UserContext.clear();
        }
    }

    // ========== DLQ & Retry ==========

    private void moveToDlq(Map<Object, Object> originalPayload, String errorReason) {
        try {
            Map<String, String> dlqPayload = new HashMap<>();
            originalPayload.forEach((k, v) -> dlqPayload.put(String.valueOf(k), String.valueOf(v)));
            dlqPayload.put("dlqReason", errorReason);
            dlqPayload.put("dlqTimestamp", String.valueOf(System.currentTimeMillis()));

            redisTemplate.opsForStream().add(INGEST_DLQ_KEY, dlqPayload);
            log.warn("[DLQ] Moved record to dead letter queue: reason={}", errorReason);

            // Update asset status if present
            String assetId = dlqPayload.get("assetId");
            if (assetId != null && !assetId.isEmpty()) {
                updateAssetStatus(assetId, "FAILED");
            }
        } catch (Exception e) {
            log.error("[DLQ] Failed to write to dead letter queue", e);
        }
    }

    private void reenqueueWithRetry(Map<Object, Object> originalPayload, int newRetryCount) {
        try {
            Map<String, String> retryPayload = new HashMap<>();
            originalPayload.forEach((k, v) -> retryPayload.put(String.valueOf(k), String.valueOf(v)));
            retryPayload.put("retryCount", String.valueOf(newRetryCount));

            redisTemplate.opsForStream().add(INGEST_STREAM_KEY, retryPayload);
            log.info("[RedisStream] Re-enqueued record with retryCount={}", newRetryCount);
        } catch (Exception e) {
            log.error("[RedisStream] Failed to re-enqueue record for retry", e);
        }
    }

    private int parseRetryCount(Map<Object, Object> map) {
        try {
            String val = getStringValue(map, "retryCount");
            return val != null ? Integer.parseInt(val) : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // ========== Notification ==========

    private void notifyIngested(String userId, String refId, int segmentCount) {
        try {
            Map<String, Object> dataMap = new HashMap<>();
            dataMap.put("refId", refId);
            dataMap.put("userId", userId);
            dataMap.put("segmentCount", segmentCount);

            String payload = objectMapper.writeValueAsString(dataMap);
            SyncEvent event = SyncEvent.of("DOC_INGESTED", "assets", refId, payload);

            String eventJson = objectMapper.writeValueAsString(event);
            webSocketHandler.broadcast(eventJson);

            log.info("[RedisStream] Broadcasted DOC_INGESTED for ref: {} ({} segments)", refId, segmentCount);
        } catch (Exception e) {
            log.error("[RedisStream] WebSocket broadcast failure", e);
        }
    }

    private void notifyFailed(Map<Object, Object> map, String errorMsg) {
        try {
            String userId = getStringValue(map, "userId");
            String assetId = getStringValue(map, "assetId");
            String fileName = getStringValue(map, "fileName");

            Map<String, Object> dataMap = new HashMap<>();
            dataMap.put("userId", userId);
            dataMap.put("assetId", assetId != null ? assetId : "");
            dataMap.put("fileName", fileName != null ? fileName : "");
            dataMap.put("error", truncate(errorMsg, 200));

            String payload = objectMapper.writeValueAsString(dataMap);
            SyncEvent event = SyncEvent.of("INGEST_FAILED", "assets", assetId != null ? assetId : "", payload);

            String eventJson = objectMapper.writeValueAsString(event);
            webSocketHandler.broadcast(eventJson);

            log.info("[RedisStream] Broadcasted INGEST_FAILED for asset: {}", assetId);
        } catch (Exception e) {
            log.error("[RedisStream] Failed to broadcast INGEST_FAILED notification", e);
        }
    }

    // ========== Helpers ==========

    private void updateAssetStatus(String assetId, String status) {
        try {
            Asset asset = assetService.getById(assetId);
            if (asset != null) {
                asset.setStatus(status);
                assetService.updateById(asset);
            }
        } catch (Exception e) {
            log.warn("[Asset] Failed to update asset status for {}: {}", assetId, e.getMessage());
        }
    }

    private boolean isRateLimitError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) return false;
        return msg.contains("429") || msg.contains("rate limit") || msg.contains("Too Many Requests");
    }

    private String getStringValue(Map<Object, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : null;
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        String clean = text.replaceAll("\\s+", " ").trim();
        return clean.length() > maxLen ? clean.substring(0, maxLen) + "..." : clean;
    }

    /**
     * Custom exception for rate limit errors (enables targeted retry logic).
     */
    private static class RateLimitException extends Exception {
        public RateLimitException(String message) {
            super(message);
        }
    }

    /**
     * Internal custom Token Bucket Rate Limiter
     */
    private static class TokenBucketRateLimiter {
        private final double capacity;
        private final double refillRatePerSecond;
        private double tokens;
        private long lastRefillTime;

        public TokenBucketRateLimiter(double capacity, double refillRatePerSecond) {
            this.capacity = capacity;
            this.refillRatePerSecond = refillRatePerSecond;
            this.tokens = capacity;
            this.lastRefillTime = System.nanoTime();
        }

        public synchronized void acquire() throws InterruptedException {
            while (true) {
                refill();
                if (tokens >= 1.0) {
                    tokens -= 1.0;
                    return;
                }
                long sleepTimeMs = (long) ((1.0 - tokens) / refillRatePerSecond * 1000.0);
                Thread.sleep(Math.max(1, sleepTimeMs));
            }
        }

        private void refill() {
            long now = System.nanoTime();
            double deltaSeconds = (now - lastRefillTime) / 1_000_000_000.0;
            if (deltaSeconds > 0) {
                tokens = Math.min(capacity, tokens + deltaSeconds * refillRatePerSecond);
                lastRefillTime = now;
            }
        }
    }
}
