package com.auralis.app.ai.internal.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class OpenAiCompatibleProvider implements AiProviderPort {

    private final AiProviderType providerType;

    public OpenAiCompatibleProvider() {
        this(AiProviderType.OPENAI_COMPATIBLE);
    }

    protected OpenAiCompatibleProvider(AiProviderType providerType) {
        this.providerType = providerType;
    }

    @Override
    public AiProviderType type() {
        return providerType;
    }

    @Override
    public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
        validateCredential(credential);
        try {
            JsonNode body = RestClient.builder()
                    .baseUrl(trimTrailingSlash(credential.baseUrl()))
                    .defaultHeader("Authorization", "Bearer " + credential.apiKey())
                    .build()
                    .post()
                    .uri("/chat/completions")
                    .body(requestBody(request))
                    .retrieve()
                    .body(JsonNode.class);
            return parseResponse(body);
        } catch (DomainException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            throw providerError(exception);
        } catch (RestClientException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable");
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response");
        }
    }

    protected void validateCredential(AiCredential credential) {
        if (credential == null || credential.baseUrl() == null || credential.baseUrl().isBlank()
                || credential.apiKey() == null || credential.apiKey().isBlank()) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is not configured");
        }
    }

    protected Map<String, Object> requestBody(AiProviderRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.model());
        body.put("messages", request.messages().stream().map(message -> Map.of(
                "role", roleName(message.role()),
                "content", message.content())).toList());
        if (request.temperature() != null) {
            body.put("temperature", request.temperature());
        }
        if (request.maxTokens() != null) {
            body.put("max_tokens", request.maxTokens());
        }
        return body;
    }

    protected AiProviderResponse parseResponse(JsonNode body) {
        JsonNode content = body == null ? null : body.path("choices").path(0).path("message").path("content");
        if (content == null || content.isMissingNode() || !content.isTextual() || content.asText().isBlank()) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response");
        }
        JsonNode usage = body.path("usage");
        return new AiProviderResponse(
                content.asText(),
                usage.path("prompt_tokens").asLong(0),
                usage.path("completion_tokens").asLong(0));
    }

    private DomainException providerError(RestClientResponseException exception) {
        int status = exception.getStatusCode().value();
        if (status == 429) {
            return new DomainException("RATE_LIMITED", "AI provider rate limit reached");
        }
        if (status == 408 || status >= 500) {
            return new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable");
        }
        return new DomainException("MODEL_PROVIDER_ERROR", "AI provider rejected the request");
    }

    private String roleName(AiMessageRole role) {
        return role.name().toLowerCase(java.util.Locale.ROOT);
    }

    private String trimTrailingSlash(String baseUrl) {
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }
}
