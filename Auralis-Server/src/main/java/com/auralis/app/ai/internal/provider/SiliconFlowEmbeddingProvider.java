package com.auralis.app.ai.internal.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

@Component
public class SiliconFlowEmbeddingProvider implements EmbeddingProviderPort {

    @Override
    public AiProviderType type() {
        return AiProviderType.SILICONFLOW;
    }

    @Override
    public EmbeddingResult embed(List<String> texts, AiCredential credential) {
        if (texts == null || texts.isEmpty()) {
            throw new DomainException("VALIDATION_FAILED", "Embedding input must not be empty");
        }
        if (credential == null || credential.baseUrl() == null || credential.baseUrl().isBlank()
                || credential.apiKey() == null || credential.apiKey().isBlank()) {
            throw new DomainException("MODEL_UNAVAILABLE", "Embedding provider is not configured");
        }
        try {
            JsonNode body = RestClient.builder()
                    .baseUrl(trimTrailingSlash(credential.baseUrl()))
                    .defaultHeader("Authorization", "Bearer " + credential.apiKey())
                    .build()
                    .post()
                    .uri("/embeddings")
                    .body(Map.of("model", credential.model() == null || credential.model().isBlank()
                            ? "BAAI/bge-m3" : credential.model(), "input", texts))
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null || !body.path("data").isArray() || body.path("data").size() != texts.size()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid response");
            }
            List<List<Double>> vectors = new java.util.ArrayList<>();
            for (JsonNode item : body.path("data")) {
                List<Double> vector = new java.util.ArrayList<>();
                for (JsonNode value : item.path("embedding")) {
                    vector.add(value.asDouble());
                }
                vectors.add(vector);
            }
            return new EmbeddingResult(vectors);
        } catch (DomainException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            if (status == 429) {
                throw new DomainException("RATE_LIMITED", "Embedding provider rate limit reached");
            }
            throw new DomainException(status >= 500 ? "MODEL_UNAVAILABLE" : "MODEL_PROVIDER_ERROR",
                    "Embedding provider request failed");
        } catch (RestClientException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "Embedding provider is unavailable");
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid response");
        }
    }

    private String trimTrailingSlash(String baseUrl) {
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }
}
