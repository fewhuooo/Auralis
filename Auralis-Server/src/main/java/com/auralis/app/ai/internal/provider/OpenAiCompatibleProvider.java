package com.auralis.app.ai.internal.provider;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiStreamAbortException;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderResponseTooLargeException;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.SocketTimeoutException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

@Component
public class OpenAiCompatibleProvider implements AiProviderPort {

    private static final ObjectMapper STREAM_OBJECT_MAPPER = new ObjectMapper();
    private static final Logger LOGGER = LoggerFactory.getLogger(OpenAiCompatibleProvider.class);
    private static final int MAX_LOGGED_MODEL_IDENTIFIER_CHARS = 64;

    private final AiProviderType providerType;
    private final ProviderEndpointPolicy endpointPolicy;
    private final ProviderHttpClient httpClient;

    @Value("${auralis.ai.thinking-enabled:false}")
    private boolean thinkingEnabled;

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
        return complete(request, credential, null, null);
    }

    @Override
    public AiProviderResponse complete(
            AiProviderRequest request,
            AiCredential credential,
            long responseTimeoutMillis) {
        return complete(request, credential, Long.valueOf(responseTimeoutMillis), null);
    }

    @Override
    public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                       long responseTimeoutMillis, OverviewCancellation cancellation) {
        return complete(request, credential, Long.valueOf(responseTimeoutMillis), cancellation);
    }

    private AiProviderResponse complete(
            AiProviderRequest request,
            AiCredential credential,
            Long responseTimeoutMillis,
            OverviewCancellation cancellation) {
        validateCredential(credential);
        try {
            URI baseUri = URI.create(credential.baseUrl().trim());
            ResolvedProviderEndpoint endpoint = cancellation == null
                    ? endpointPolicy.resolve(providerType, baseUri)
                    : endpointPolicy.resolve(providerType, baseUri, responseTimeoutMillis, cancellation);
            JsonNode body;
            if (!request.overviewCapacityRequest() && responseTimeoutMillis == null) {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class);
            } else if (!request.overviewCapacityRequest()) {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class, responseTimeoutMillis, cancellation);
            } else if (responseTimeoutMillis == null) {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class, cancellation,
                        overviewResponseByteLimit(request));
            } else {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class,
                        responseTimeoutMillis, cancellation, overviewResponseByteLimit(request));
            }
            return parseResponse(body, request);
        } catch (DomainException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            throw providerError(exception.status(), exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        } catch (SocketTimeoutException exception) {
            throw new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
        } catch (IOException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        }
    }

    private long overviewResponseByteLimit(AiProviderRequest request) {
        return request.overviewResponseByteLimit() > 0
                ? request.overviewResponseByteLimit() : Long.MAX_VALUE;
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
            Map<String, Object> body = new LinkedHashMap<>(requestBody(request, credential));
            body.put("stream", true);
            if (providerType == AiProviderType.OPENAI_COMPATIBLE) {
                body.put("stream_options", Map.of("include_usage", true));
            }
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
        } catch (SocketTimeoutException exception) {
            throw new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
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

    protected Map<String, Object> requestBody(AiProviderRequest request, AiCredential credential) {
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
        if (request.structuredJson()) {
            body.put("response_format", Map.of("type", "json_object"));
        }
        if (supportsThinkingControl(credential)) {
            body.put("thinking", Map.of("type", thinkingEnabled ? "enabled" : "disabled"));
        }
        return body;
    }

    private boolean supportsThinkingControl(AiCredential credential) {
        if (providerType == AiProviderType.DEEPSEEK) return true;
        if (providerType != AiProviderType.OPENAI_COMPATIBLE || credential == null
                || credential.baseUrl() == null) return false;
        try {
            return "api.xiaomimimo.com".equalsIgnoreCase(URI.create(credential.baseUrl().trim()).getHost());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    protected AiProviderResponse parseResponse(JsonNode body, AiProviderRequest request) {
        JsonNode content = body == null ? null : body.path("choices").path(0).path("message").path("content");
        if (content == null || content.isMissingNode() || !content.isTextual() || content.asText().isBlank()) {
            logInvalidResponseEnvelope(body, request);
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response");
        }
        JsonNode usage = body.path("usage");
        return new AiProviderResponse(
                content.asText(),
                tokenCount(usage, "prompt_tokens"),
                tokenCount(usage, "completion_tokens"),
                normalizedFinishReason(body),
                responseModelIdentity(body));
    }

    private AiProviderModelIdentity responseModelIdentity(JsonNode body) {
        if (body == null || !body.has("model")) return AiProviderModelIdentity.missing();
        JsonNode model = body.get("model");
        return model != null && model.isTextual()
                ? AiProviderModelIdentity.fromProviderValue(model.textValue())
                : AiProviderModelIdentity.invalid();
    }

    private Long tokenCount(JsonNode usage, String field) {
        if (usage == null || !usage.isObject()) return null;
        JsonNode value = usage.path(field);
        return value.isIntegralNumber() && value.canConvertToLong() ? value.longValue() : null;
    }

    private String normalizedFinishReason(JsonNode body) {
        JsonNode choice = body == null ? null : body.path("choices").path(0);
        JsonNode value = choice == null ? null : choice.path("finish_reason");
        if (value == null || value.isMissingNode() || value.isNull()) return null;
        if (!value.isTextual()) return "other";
        return switch (value.asText()) {
            case "stop", "length", "tool_calls", "content_filter" -> value.asText();
            default -> "other";
        };
    }

    private void logInvalidResponseEnvelope(JsonNode body, AiProviderRequest request) {
        JsonNode choices = body == null ? null : body.path("choices");
        int choiceCount = choices != null && choices.isArray() ? choices.size() : 0;
        JsonNode choice = choiceCount > 0 ? choices.get(0) : null;
        JsonNode message = choice == null ? null : choice.path("message");
        JsonNode content = message == null ? null : message.path("content");
        JsonNode reasoning = message == null ? null : message.path("reasoning_content");
        JsonNode usage = body == null ? null : body.path("usage");
        LOGGER.warn("AI_PROVIDER_RESPONSE_INVALID provider={} modelId={} choiceCount={} finishReason={} "
                        + "hasReasoningContent={} reasoningChars={} contentType={} contentChars={} hasContent={} hasUsage={} promptTokens={} completionTokens={}",
                providerType, safeModelIdentifier(request), choiceCount, safeFinishReason(choice),
                message != null && message.has("reasoning_content"), textLength(reasoning), nodeType(content),
                textLength(content),
                content != null && content.isTextual() && !content.asText().isBlank(),
                usage != null && usage.isObject(), safeTokenCount(usage, "prompt_tokens"),
                safeTokenCount(usage, "completion_tokens"));
    }

    private String safeModelIdentifier(AiProviderRequest request) {
        String model = request == null ? null : request.model();
        if (model == null || model.isBlank()) return "<none>";
        StringBuilder sanitized = new StringBuilder(Math.min(model.length(), MAX_LOGGED_MODEL_IDENTIFIER_CHARS));
        for (int index = 0; index < model.length() && sanitized.length() < MAX_LOGGED_MODEL_IDENTIFIER_CHARS; index++) {
            char character = model.charAt(index);
            sanitized.append((character >= 'a' && character <= 'z')
                    || (character >= 'A' && character <= 'Z')
                    || (character >= '0' && character <= '9')
                    || character == '.' || character == '_' || character == '-' || character == '/'
                    ? character : '_');
        }
        return sanitized.toString();
    }

    private int textLength(JsonNode node) {
        return node != null && node.isTextual() ? node.asText().length() : 0;
    }

    private String safeFinishReason(JsonNode choice) {
        if (choice == null) return "missing";
        JsonNode value = choice.path("finish_reason");
        if (!value.isTextual()) return value.isMissingNode() ? "missing" : "non_text";
        return switch (value.asText()) {
            case "stop", "length", "tool_calls", "content_filter" -> value.asText();
            default -> "other";
        };
    }

    private String nodeType(JsonNode node) {
        if (node == null || node.isMissingNode()) return "missing";
        if (node.isNull()) return "null";
        if (node.isTextual()) return "text";
        if (node.isObject()) return "object";
        if (node.isArray()) return "array";
        if (node.isBoolean()) return "boolean";
        if (node.isNumber()) return "number";
        return "other";
    }

    private long safeTokenCount(JsonNode usage, String field) {
        if (usage == null || !usage.isObject() || !usage.path(field).isNumber()) return 0;
        long value = usage.path(field).asLong(0);
        return Math.max(0, value);
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
            AiProviderModelIdentity modelIdentity = responseModelIdentity(body);
            AiTokenUsage usage = parseUsage(body == null ? null : body.path("usage"));
            JsonNode choices = body == null ? null : body.path("choices");
            if ((choices == null || !choices.isArray() || choices.isEmpty()) && usage != null) {
                sink.accept(new AiProviderChunk("", false, usage, modelIdentity));
                return;
            }
            JsonNode choice = body.path("choices").path(0);
            JsonNode content = choice.path("delta").path("content");
            boolean emitted = false;
            if (content.isTextual() && !content.asText().isEmpty()) {
                sink.accept(new AiProviderChunk(content.asText(), false, null, modelIdentity));
                emitted = true;
            }
            JsonNode finishReason = choice.path("finish_reason");
            if (!finishReason.isMissingNode() && !finishReason.isNull()) {
                sink.accept(new AiProviderChunk("", true, usage, modelIdentity));
                emitted = true;
            } else if (usage != null) {
                sink.accept(new AiProviderChunk("", false, usage, modelIdentity));
                emitted = true;
            }
            if (!emitted && modelIdentity.status() != AiProviderModelIdentity.Status.MISSING) {
                sink.accept(new AiProviderChunk("", false, null, modelIdentity));
            }
        } catch (AiStreamAbortException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid stream event");
        }
    }

    private AiTokenUsage parseUsage(JsonNode usage) {
        if (usage == null || !usage.isObject()) return null;
        Long input = tokenCount(usage, "prompt_tokens");
        Long output = tokenCount(usage, "completion_tokens");
        return input == null && output == null ? null : new AiTokenUsage(input, output);
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
