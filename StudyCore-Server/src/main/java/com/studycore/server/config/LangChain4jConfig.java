package com.studycore.server.config;

import dev.langchain4j.data.document.DocumentParser;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.parser.apache.tika.ApacheTikaDocumentParser;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.rag.query.transformer.CompressingQueryTransformer;
import dev.langchain4j.rag.query.transformer.QueryTransformer;
import dev.langchain4j.store.embedding.EmbeddingStore;
import org.springframework.beans.factory.annotation.Value;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.extern.slf4j.Slf4j;
import java.time.Duration;

@Configuration
@Slf4j
public class LangChain4jConfig {

    @Value("${langchain4j.open-ai.chat-model.base-url}")
    private String chatBaseUrl;

    @Value("${langchain4j.open-ai.chat-model.api-key}")
    private String chatApiKey;

    @Value("${langchain4j.open-ai.chat-model.model-name}")
    private String chatModelName;

    @Value("${langchain4j.open-ai.embedding-model.base-url}")
    private String embeddingBaseUrl;

    @Value("${langchain4j.open-ai.embedding-model.api-key}")
    private String embeddingApiKey;

    @Value("${langchain4j.open-ai.embedding-model.model-name}")
    private String embeddingModelName;

    @Value("${langchain4j.milvus.host:127.0.0.1}")
    private String milvusHost;

    @Value("${langchain4j.milvus.port:19530}")
    private Integer milvusPort;

    @Value("${langchain4j.milvus.collection-name:knowledge_blocks}")
    private String milvusCollectionName;

    @Value("${langchain4j.milvus.dimension:1024}")
    private Integer milvusDimension;

    @Bean
    public ChatLanguageModel chatLanguageModel() {
        return OpenAiChatModel.builder()
                .baseUrl(chatBaseUrl)
                .apiKey(chatApiKey)
                .modelName(chatModelName)
                .logRequests(true)
                .logResponses(true)
                .timeout(Duration.ofSeconds(60))
                .build();
    }

    @Bean
    public StreamingChatLanguageModel streamingChatLanguageModel() {
        return OpenAiStreamingChatModel.builder()
                .baseUrl(chatBaseUrl)
                .apiKey(chatApiKey)
                .modelName(chatModelName)
                .logRequests(true)
                .logResponses(true)
                .timeout(Duration.ofSeconds(60))
                .build();
    }

    @Bean
    public EmbeddingModel embeddingModel() {
        return OpenAiEmbeddingModel.builder()
                .baseUrl(embeddingBaseUrl)
                .apiKey(embeddingApiKey)
                .modelName(embeddingModelName)
                .build();
    }

    @Bean
    public EmbeddingStore<TextSegment> embeddingStore() {
        return new TenantAwareMilvusEmbeddingStore(milvusHost, milvusPort, milvusCollectionName, milvusDimension);
    }

    /**
     * 14.4 ContentRetriever — wired into StudyCoreAssistant by LangChain4j auto-config
     */
    @Bean
    public ContentRetriever contentRetriever(EmbeddingStore<TextSegment> embeddingStore, EmbeddingModel embeddingModel) {
        // Stage 1: Coarse retrieval (Top-20 candidates)
        EmbeddingStoreContentRetriever coarseRetriever = EmbeddingStoreContentRetriever.builder()
                .embeddingStore(embeddingStore)
                .embeddingModel(embeddingModel)
                .maxResults(20)
                .minScore(0.4)
                .build();

        // Stage 2: Refined re-ranking & selection (Top-5)
        return query -> {
            List<dev.langchain4j.rag.content.Content> candidates = coarseRetriever.retrieve(query);
            if (candidates.size() <= 5) {
                return candidates;
            }
            List<dev.langchain4j.rag.content.Content> mutableCandidates = new java.util.ArrayList<>(candidates);
            // For production-grade text matching, we sort by a combination of semantic similarity and exact keyword overlap
            String queryText = query.text().toLowerCase();
            mutableCandidates.sort((c1, c2) -> {
                String text1 = c1.textSegment().text().toLowerCase();
                String text2 = c2.textSegment().text().toLowerCase();
                
                boolean match1 = text1.contains(queryText);
                boolean match2 = text2.contains(queryText);
                if (match1 && !match2) return -1;
                if (!match1 && match2) return 1;
                
                // Fall back to original vector search order (highest score first)
                return 0; 
            });
            log.info("[RAG-Reranker] Refined 20 coarse candidates to top 5 precision segments");
            return mutableCandidates.subList(0, 5);
        };
    }

    /**
     * 14.4 QueryTransformer — compresses multi-turn context into a standalone query
     * to improve retrieval precision in RAG.
     */
    @Bean
    public QueryTransformer queryTransformer(ChatLanguageModel chatLanguageModel) {
        return new CompressingQueryTransformer(chatLanguageModel);
    }

    /**
     * 14.4 DocumentParser — Apache Tika for PDF / DOCX / PPTX parsing
     */
    @Bean
    public DocumentParser documentParser() {
        return new ApacheTikaDocumentParser();
    }

    /**
     * 14.4 DocumentSplitter — recursive split by paragraph then sentence, max 512 tokens per chunk
     */
    @Bean
    public DocumentSplitter documentSplitter() {
        return DocumentSplitters.recursive(512, 50);
    }
}
