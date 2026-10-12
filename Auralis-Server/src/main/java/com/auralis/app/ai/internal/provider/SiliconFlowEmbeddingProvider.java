package com.auralis.app.ai.internal.provider;

import tools.jackson.databind.JsonNode;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderResponseTooLargeException;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;

@Component
public class SiliconFlowEmbeddingProvider implements EmbeddingProviderPort {

    private final ProviderEndpointPolicy endpointPolicy;
    private final ProviderHttpClient httpClient;

    public SiliconFlowEmbeddingProvider(ProviderEndpointPolicy endpointPolicy, ProviderHttpClient httpClient) {
        this.endpointPolicy = endpointPolicy;
        this.httpClient = httpClient;
    }

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
            ResolvedProviderEndpoint endpoint = endpointPolicy.resolve(
                    AiProviderType.SILICONFLOW, URI.create(credential.baseUrl().trim()));
            JsonNode body = httpClient.postJson(
                    endpoint,
                    "/embeddings",
                    credential.apiKey(),
                    Map.of("model", credential.model() == null || credential.model().isBlank()
                            ? "BAAI/bge-m3" : credential.model(), "input", texts),
                    JsonNode.class);
            if (body == null || !body.path("data").isArray() || body.path("data").size() != texts.size()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid response");
            }
            List<List<Double>> vectors = new java.util.ArrayList<>(java.util.Collections.nCopies(texts.size(), null));
            boolean[] indexes = new boolean[texts.size()];
            for (JsonNode item : body.path("data")) {
                JsonNode indexNode = item.path("index");
                if (!item.isObject() || !indexNode.isIntegralNumber() || !indexNode.canConvertToInt()) {
                    throw invalidResponse();
                }
                int index = indexNode.intValue();
                if (index < 0 || index >= texts.size() || indexes[index]) {
                    throw invalidResponse();
                }
                JsonNode embedding = item.path("embedding");
                if (!embedding.isArray()) {
                    throw invalidResponse();
                }
                List<Double> vector = new java.util.ArrayList<>();
                for (JsonNode value : embedding) {
                    if (!value.isNumber()) {
                        throw invalidResponse();
                    }
                    vector.add(value.asDouble());
                }
                vectors.set(index, vector);
                indexes[index] = true;
            }
            for (boolean present : indexes) {
                if (!present) throw invalidResponse();
            }
            JsonNode usage = body.path("usage");
            JsonNode inputTokensNode = usage == null || !usage.isObject() ? null : usage.path("prompt_tokens");
            Long inputTokens = inputTokensNode != null && inputTokensNode.isIntegralNumber()
                    && inputTokensNode.canConvertToLong() ? inputTokensNode.longValue() : null;
            JsonNode outputTokensNode = usage == null || !usage.isObject() ? null : usage.path("completion_tokens");
            Long outputTokens = outputTokensNode != null && outputTokensNode.isIntegralNumber()
                    && outputTokensNode.canConvertToLong() && outputTokensNode.longValue() >= 0
                    ? outputTokensNode.longValue() : null;
            return new EmbeddingResult(vectors,
                    inputTokens == null && outputTokens == null
                            ? null : new AiTokenUsage(inputTokens, outputTokens));
        } catch (DomainException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            int status = exception.status();
            if (status == 429) {
                throw new DomainException("RATE_LIMITED", "Embedding provider rate limit reached", null, exception);
            }
            throw new DomainException(status >= 500 ? "MODEL_UNAVAILABLE" : "MODEL_PROVIDER_ERROR",
                    "Embedding provider request failed", null, exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid response", null,
                    exception);
        } catch (SocketTimeoutException exception) {
            throw new DomainException("MODEL_TIMEOUT", "Embedding provider response timed out", null, exception);
        } catch (IOException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "Embedding provider is unavailable", null, exception);
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid response", null,
                    exception);
        }
    }

    private DomainException invalidResponse() {
        return new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid response");
    }

}
