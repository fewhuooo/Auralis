package com.studycore.server.service;

import com.studycore.server.common.UserContext;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentParser;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.segment.TextSegment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 15.5 Document Ingestion Pipeline (Asynchronous & Rate-Limited via Redis Stream)
 *
 * Full chain:
 * 1. Synchronously parse file (Tika) & split into text segments in Web thread (bounded pool).
 * 2. Push text segments with multi-tenant headers to Redis Stream.
 * 3. Asynchronous Virtual Thread consumer processes segments with Token Bucket rate limiter.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentIngestionService {

    public static final String INGEST_STREAM_KEY = "studycore:ingest_stream";

    private final DocumentParser documentParser;
    private final DocumentSplitter documentSplitter;
    private final RedisTemplate<String, Object> redisTemplate;

    /**
     * Parse raw file and enqueue segments to Redis Stream for rate-limited embedding.
     */
    public List<String> ingestFile(byte[] fileBytes, String fileName, String subject) {
        log.info("[Ingest] Parsing file synchronously: {} ({} bytes)", fileName, fileBytes.length);

        // Step 1: Parse using Apache Tika
        InputStream inputStream = new ByteArrayInputStream(fileBytes);
        Document document = documentParser.parse(inputStream);
        document.metadata().put("source", fileName);

        // Step 2: Split into segments (max 512 tokens)
        List<TextSegment> segments = documentSplitter.split(document);
        log.info("[Ingest] Split into {} segments, enqueueing to Redis Stream", segments.size());

        // Step 3: Enqueue segments to Redis Stream
        return enqueueSegments(segments, fileName, subject);
    }

    /**
     * Enqueue plain text content to Redis Stream.
     */
    public List<String> ingestText(String textContent, String source, String subject) {
        log.info("[Ingest] Parsing text content ({} chars), enqueueing to Redis Stream", textContent.length());

        Document document = Document.from(textContent, Metadata.from("source", source));
        List<TextSegment> segments = documentSplitter.split(document);

        return enqueueSegments(segments, source, subject);
    }

    private List<String> enqueueSegments(List<TextSegment> segments, String source, String subject) {
        String userId = UserContext.getCurrentUserId();
        String userApiKey = UserContext.getUserApiKey();
        String userBaseUrl = UserContext.getUserBaseUrl();

        List<String> enqueuedJobIds = new ArrayList<>();

        for (int i = 0; i < segments.size(); i++) {
            TextSegment seg = segments.get(i);
            
            Map<String, String> payload = new HashMap<>();
            payload.put("userId", userId != null ? userId : "system_default");
            payload.put("userApiKey", userApiKey != null ? userApiKey : "");
            payload.put("userBaseUrl", userBaseUrl != null ? userBaseUrl : "");
            payload.put("text", seg.text());
            payload.put("source", source);
            payload.put("subject", subject != null ? subject : "文档导入");
            payload.put("index", String.valueOf(i));
            payload.put("total", String.valueOf(segments.size()));

            try {
                // Post to Redis Stream
                org.springframework.data.redis.connection.stream.RecordId recordId = 
                        redisTemplate.opsForStream().add(INGEST_STREAM_KEY, payload);
                
                if (recordId != null) {
                    enqueuedJobIds.add(recordId.getValue());
                }
            } catch (Exception e) {
                log.error("[Ingest] Failed to enqueue segment to Redis Stream", e);
            }
        }

        log.info("[Ingest] Enqueued {} segments to Redis Stream for background ingestion", enqueuedJobIds.size());
        return enqueuedJobIds;
    }
}

