package com.auralis.app.ai.internal.provider;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiStreamAbortException;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderResponseTooLargeException;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

@Component
public class OpenAiCompatibleProvider implements AiProviderPort {

    private static final ObjectMapper STREAM_OBJECT_MAPPER = new ObjectMapper();

    private final AiProviderType providerType;
    private final ProviderEndpointPolicy endpointPolicy;
    private final ProviderHttpClient httpClient;

    @Autowired
    public OpenAiCompatibleProvider(ProviderEndpointPolicy endpointPolicy, ProviderHttpClient httpClient) {
        this(AiProviderType.OPENAI_COMPATIBLE, endpointPolicy, httpClient);
    }

    protected OpenAiCompatibleProvider(
            AiProviderType providerType,
            ProviderEndpointPolicy endpointPolicy,
            ProviderHttpClient httpClient) {
        this.providerType = providerType;
        this.endpointPolicy = endpointPolicy;
        this.httpClient = httpClient;
    }

    @Override
    public AiProviderType type() {
        return providerType;
    }

    @Override
    public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
        validateCredential(credential);
        try {
            ResolvedProviderEndpoint endpoint = endpointPolicy.resolve(
                    providerType, URI.create(credential.baseUrl().trim()));
            JsonNode body = httpClient.postJson(
                    endpoint, "/chat/completions", credential.apiKey(), requestBody(request), JsonNode.class);
            return parseResponse(body);
        } catch (DomainException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            throw providerError(exception.status(), exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        } catch (IOException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        }
    }

    @Override
    public void streamInto(
            AiProviderRequest request,
            AiCredential credential,
            Consumer<AiProviderChunk> sink) {
        validateCredential(credential);
        Objects.requireNonNull(sink, "sink");
        try {
            ResolvedProviderEndpoint endpoint = endpointPolicy.resolve(
                    providerType, URI.create(credential.baseUrl().trim()));
            Map<String, Object> body = new LinkedHashMap<>(requestBody(request));
            body.put("stream", true);
            httpClient.postStream(
                    endpoint, "/chat/completions", credential.apiKey(), body,
                    line -> parseStreamLine(line, sink));
        } catch (AiStreamAbortException exception) {
            throw exception;
        } catch (DomainException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            throw providerError(exception.status(), exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        } catch (IOException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
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

    private void parseStreamLine(String line, Consumer<AiProviderChunk> sink) {
        if (line == null || line.isBlank() || !line.startsWith("data:")) {
            return;
        }
        String payload = line.substring("data:".length()).trim();
        if (payload.equals("[DONE]")) {
            sink.accept(new AiProviderChunk("", true));
            return;
        }
        try {
            JsonNode body = STREAM_OBJECT_MAPPER.readTree(payload);
            JsonNode choice = body.path("choices").path(0);
            JsonNode content = choice.path("delta").path("content");
            if (content.isTextual() && !content.asText().isEmpty()) {
                sink.accept(new AiProviderChunk(content.asText(), false));
            }
            JsonNode finishReason = choice.path("finish_reason");
            if (!finishReason.isMissingNode() && !finishReason.isNull()) {
                sink.accept(new AiProviderChunk("", true));
            }
        } catch (AiStreamAbortException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid stream event");
        }
    }

    private DomainException providerError(int status, Throwable cause) {
        if (status == 429) {
            return new DomainException("RATE_LIMITED", "AI provider rate limit reached", null, cause);
        }
        if (status == 408 || status >= 500) {
            return new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, cause);
        }
        return new DomainException("MODEL_PROVIDER_ERROR", "AI provider rejected the request", null, cause);
    }

    private String roleName(AiMessageRole role) {
        return role.name().toLowerCase(java.util.Locale.ROOT);
    }

}
