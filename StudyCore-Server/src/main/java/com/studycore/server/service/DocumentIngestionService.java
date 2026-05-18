package com.studycore.server.service;

import com.studycore.server.entity.KnowledgeBlock;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentParser;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 14.4 Document Ingestion Pipeline
 *
 * Full chain: DocumentParser (Tika) → DocumentSplitter → EmbeddingModel → EmbeddingStore
 * Also persists metadata to PostgreSQL via KnowledgeBlockService.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentIngestionService {

    private final DocumentParser documentParser;
    private final DocumentSplitter documentSplitter;
    private final EmbeddingModel embeddingModel;
    private final EmbeddingStore<TextSegment> embeddingStore;
    private final KnowledgeBlockService knowledgeBlockService;

    /**
     * Ingest raw file bytes (PDF / DOCX / PPTX).
     *
     * @param fileBytes   raw file content
     * @param fileName    original filename (used for source metadata)
     * @param subject     subject/category tag
     * @return list of persisted KnowledgeBlock IDs
     */
    public List<String> ingestFile(byte[] fileBytes, String fileName, String subject) {
        log.info("[Ingest] Parsing file: {} ({} bytes)", fileName, fileBytes.length);

        // Step 1: Parse document using Apache Tika
        InputStream inputStream = new ByteArrayInputStream(fileBytes);
        Document document = documentParser.parse(inputStream);
        document.metadata().put("source", fileName);

        // Step 2: Split into segments (max 512 tokens per chunk)
        List<TextSegment> segments = documentSplitter.split(document);
        log.info("[Ingest] Split into {} segments", segments.size());

        // Step 3: Generate embeddings for all segments
        List<Embedding> embeddings = embeddingModel.embedAll(segments).content();

        // Step 4: Store segments + embeddings in the vector store
        embeddingStore.addAll(embeddings, segments);
        log.info("[Ingest] Stored {} embeddings in vector store", embeddings.size());

        // Step 5: Persist metadata to PostgreSQL
        List<String> blockIds = new ArrayList<>();
        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        for (int i = 0; i < segments.size(); i++) {
            TextSegment seg = segments.get(i);
            KnowledgeBlock block = new KnowledgeBlock();
            block.setSubject(subject != null ? subject : "文档导入");
            block.setTitle(truncate(seg.text(), 50));
            block.setPreview(truncate(seg.text(), 200));
            block.setTime(now);
            block.setSource(fileName);
            block.setColor("rgba(99, 102, 241, 0.2)");
            knowledgeBlockService.save(block);
            blockIds.add(block.getId());
        }

        log.info("[Ingest] Persisted {} knowledge blocks to DB", blockIds.size());
        return blockIds;
    }

    /**
     * Ingest plain text content (for the existing /api/ai/ingest endpoint).
     *
     * @param textContent  raw text to ingest
     * @param source       source label (e.g. "用户输入", "AI 生成")
     * @param subject      subject/category
     * @return list of persisted KnowledgeBlock IDs
     */
    public List<String> ingestText(String textContent, String source, String subject) {
        log.info("[Ingest] Ingesting text ({} chars) from source: {}", textContent.length(), source);

        // Create a Document from raw text
        Document document = Document.from(textContent, Metadata.from("source", source));

        // Split
        List<TextSegment> segments = documentSplitter.split(document);
        log.info("[Ingest] Split into {} segments", segments.size());

        // Embed
        List<Embedding> embeddings = embeddingModel.embedAll(segments).content();

        // Store in vector DB
        embeddingStore.addAll(embeddings, segments);

        // Persist to PostgreSQL
        List<String> blockIds = new ArrayList<>();
        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        for (TextSegment seg : segments) {
            KnowledgeBlock block = new KnowledgeBlock();
            block.setSubject(subject != null ? subject : "文本导入");
            block.setTitle(truncate(seg.text(), 50));
            block.setPreview(truncate(seg.text(), 200));
            block.setTime(now);
            block.setSource(source);
            block.setColor("rgba(16, 185, 129, 0.2)");
            knowledgeBlockService.save(block);
            blockIds.add(block.getId());
        }

        log.info("[Ingest] Persisted {} knowledge blocks", blockIds.size());
        return blockIds;
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        String clean = text.replaceAll("\\s+", " ").trim();
        return clean.length() > maxLen ? clean.substring(0, maxLen) + "..." : clean;
    }
}
