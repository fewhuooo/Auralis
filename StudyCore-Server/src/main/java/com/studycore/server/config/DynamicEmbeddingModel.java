package com.studycore.server.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.studycore.server.common.UserContext;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.model.output.Response;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@Primary
public class DynamicEmbeddingModel implements EmbeddingModel {

    private final EmbeddingModel defaultModel;

    @Value("${langchain4j.open-ai.embedding-model.model-name:BAAI/bge-m3}")
    private String defaultModelName;

    // Cache of custom tenant embedding models: Key = API_KEY + "_" + BASE_URL
    private final Cache<String, EmbeddingModel> modelCache = Caffeine.newBuilder()
            .expireAfterAccess(30, TimeUnit.MINUTES)
            .removalListener((Object key, Object value, com.github.benmanes.caffeine.cache.RemovalCause cause) -> {
                if (value != null) {
                    log.info("[DynamicEmbeddingModel] Evicting model client for key: {}. Cause: {}", key, cause);
                    shutdownModelClient((EmbeddingModel) value);
                }
            })
            .build();

    public DynamicEmbeddingModel(EmbeddingModel defaultModel) {
        this.defaultModel = defaultModel;
    }

    private EmbeddingModel getModel() {
        String customApiKey = UserContext.getUserApiKey();
        String customBaseUrl = UserContext.getUserBaseUrl();

        if (customApiKey == null || customApiKey.trim().isEmpty()) {
            return defaultModel;
        }

        String baseUrl = (customBaseUrl != null && !customBaseUrl.trim().isEmpty()) 
                ? customBaseUrl.trim() 
                : "https://api.openai.com/v1";

        String cacheKey = customApiKey.trim() + "_" + baseUrl;

        return (EmbeddingModel) modelCache.get(cacheKey, key -> {
            log.info("[DynamicEmbeddingModel] Initializing custom embedding model client for API Key (prefix: {}) and Base URL: {}", 
                    customApiKey.substring(0, Math.min(customApiKey.length(), 6)), baseUrl);
            return OpenAiEmbeddingModel.builder()
                    .baseUrl(baseUrl)
                    .apiKey(customApiKey.trim())
                    .modelName(defaultModelName)
                    .build();
        });
    }

    private void shutdownModelClient(EmbeddingModel model) {
        try {
            Class<?> currentClass = model.getClass();
            while (currentClass != null) {
                for (Field field : currentClass.getDeclaredFields()) {
                    if (field.getType().getName().contains("OkHttpClient")) {
                        field.setAccessible(true);
                        Object client = field.get(model);
                        if (client != null) {
                            shutdownOkHttpClient(client);
                            return;
                        }
                    } else {
                        field.setAccessible(true);
                        Object wrapper = field.get(model);
                        if (wrapper != null && !wrapper.getClass().getName().startsWith("java.lang")) {
                            for (Field innerField : wrapper.getClass().getDeclaredFields()) {
                                if (innerField.getType().getName().contains("OkHttpClient")) {
                                    innerField.setAccessible(true);
                                    Object client = innerField.get(wrapper);
                                    if (client != null) {
                                        shutdownOkHttpClient(client);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
                currentClass = currentClass.getSuperclass();
            }
        } catch (Exception e) {
            log.warn("[DynamicEmbeddingModel] Failed to gracefully close OkHttpClient via reflection", e);
        }
    }

    private void shutdownOkHttpClient(Object okHttpClient) {
        try {
            log.info("[DynamicEmbeddingModel] Gracefully shutting down dynamic OkHttpClient dispatcher and pool");
            java.lang.reflect.Method dispatcherMethod = okHttpClient.getClass().getMethod("dispatcher");
            Object dispatcher = dispatcherMethod.invoke(okHttpClient);
            java.lang.reflect.Method executorServiceMethod = dispatcher.getClass().getMethod("executorService");
            java.util.concurrent.ExecutorService executorService = (java.util.concurrent.ExecutorService) executorServiceMethod.invoke(dispatcher);
            executorService.shutdown();

            java.lang.reflect.Method connectionPoolMethod = okHttpClient.getClass().getMethod("connectionPool");
            Object connectionPool = connectionPoolMethod.invoke(okHttpClient);
            java.lang.reflect.Method evictAllMethod = connectionPool.getClass().getMethod("evictAll");
            evictAllMethod.invoke(connectionPool);
        } catch (Exception e) {
            log.warn("[DynamicEmbeddingModel] Error executing shutdown methods on OkHttpClient", e);
        }
    }

    @Override
    public Response<List<Embedding>> embedAll(List<TextSegment> textSegments) {
        return getModel().embedAll(textSegments);
    }

    @Override
    public Response<Embedding> embed(String text) {
        return getModel().embed(text);
    }

    @Override
    public Response<Embedding> embed(TextSegment textSegment) {
        return getModel().embed(textSegment);
    }
}
