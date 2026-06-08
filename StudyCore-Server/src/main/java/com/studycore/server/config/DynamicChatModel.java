package com.studycore.server.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.studycore.server.common.UserContext;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.output.Response;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.lang.reflect.Field;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@Primary
public class DynamicChatModel implements ChatLanguageModel {

    private final ChatLanguageModel defaultModel;

    @Value("${langchain4j.open-ai.chat-model.model-name:gpt-4o-mini}")
    private String defaultModelName;

    // Cache of custom tenant chat models: Key = API_KEY + "_" + BASE_URL
    private final Cache<String, ChatLanguageModel> modelCache = Caffeine.newBuilder()
            .expireAfterAccess(30, TimeUnit.MINUTES)
            .removalListener((Object key, Object value, com.github.benmanes.caffeine.cache.RemovalCause cause) -> {
                if (value != null) {
                    log.info("[DynamicChatModel] Evicting model client for key: {}. Cause: {}", key, cause);
                    shutdownModelClient((ChatLanguageModel) value);
                }
            })
            .build();

    public DynamicChatModel(ChatLanguageModel defaultModel) {
        this.defaultModel = defaultModel;
    }

    private ChatLanguageModel getModel() {
        String customApiKey = UserContext.getUserApiKey();
        String customBaseUrl = UserContext.getUserBaseUrl();

        if (customApiKey == null || customApiKey.trim().isEmpty()) {
            return defaultModel;
        }

        String baseUrl = (customBaseUrl != null && !customBaseUrl.trim().isEmpty()) 
                ? customBaseUrl.trim() 
                : "https://api.openai.com/v1";

        String cacheKey = customApiKey.trim() + "_" + baseUrl;

        return (ChatLanguageModel) modelCache.get(cacheKey, key -> {
            log.info("[DynamicChatModel] Initializing custom LLM model client for API Key (prefix: {}) and Base URL: {}", 
                    customApiKey.substring(0, Math.min(customApiKey.length(), 6)), baseUrl);
            return OpenAiChatModel.builder()
                    .baseUrl(baseUrl)
                    .apiKey(customApiKey.trim())
                    .modelName(defaultModelName)
                    .logRequests(true)
                    .logResponses(true)
                    .timeout(Duration.ofSeconds(60))
                    .build();
        });
    }

    private void shutdownModelClient(ChatLanguageModel model) {
        try {
            // Traverse fields to find OkHttpClient via reflection and shut it down gracefully
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
                        // Check nested fields in case of client wrappers (e.g. OpenAiClient)
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
            log.warn("[DynamicChatModel] Failed to gracefully close OkHttpClient via reflection", e);
        }
    }

    private void shutdownOkHttpClient(Object okHttpClient) {
        try {
            log.info("[DynamicChatModel] Gracefully shutting down dynamic OkHttpClient dispatcher and pool");
            // okHttpClient.dispatcher().executorService().shutdown()
            java.lang.reflect.Method dispatcherMethod = okHttpClient.getClass().getMethod("dispatcher");
            Object dispatcher = dispatcherMethod.invoke(okHttpClient);
            java.lang.reflect.Method executorServiceMethod = dispatcher.getClass().getMethod("executorService");
            java.util.concurrent.ExecutorService executorService = (java.util.concurrent.ExecutorService) executorServiceMethod.invoke(dispatcher);
            executorService.shutdown();

            // okHttpClient.connectionPool().evictAll()
            java.lang.reflect.Method connectionPoolMethod = okHttpClient.getClass().getMethod("connectionPool");
            Object connectionPool = connectionPoolMethod.invoke(okHttpClient);
            java.lang.reflect.Method evictAllMethod = connectionPool.getClass().getMethod("evictAll");
            evictAllMethod.invoke(connectionPool);
        } catch (Exception e) {
            log.warn("[DynamicChatModel] Error executing shutdown methods on OkHttpClient", e);
        }
    }

    @Override
    public Response<AiMessage> generate(List<ChatMessage> messages) {
        return getModel().generate(messages);
    }

    @Override
    public Response<AiMessage> generate(List<ChatMessage> messages, List<ToolSpecification> toolSpecifications) {
        return getModel().generate(messages, toolSpecifications);
    }

    @Override
    public Response<AiMessage> generate(List<ChatMessage> messages, ToolSpecification toolSpecification) {
        return getModel().generate(messages, toolSpecification);
    }
}
