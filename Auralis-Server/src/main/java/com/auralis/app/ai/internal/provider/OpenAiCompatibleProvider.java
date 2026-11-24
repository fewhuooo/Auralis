package com.auralis.app.ai.internal.provider;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.core.StreamReadFeature;
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
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderToolCall;
import com.auralis.app.ai.AiProviderToolCallDelta;
import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderResponseTooLargeException;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.ai.internal.security.ProviderStreamDiagnosticException;
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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
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

    @Override
    public AiProviderResponse completeChat(AiProviderRequest request, AiCredential credential,
                                           long responseTimeoutMillis,
                                           AiProviderCallCancellation cancellation) {
        return complete(request, credential, Long.valueOf(responseTimeoutMillis), cancellation);
    }

    private AiProviderResponse complete(
            AiProviderRequest request,
            AiCredential credential,
            Long responseTimeoutMillis,
            AiProviderCallCancellation cancellation) {
        validateCredential(credential);
        Long effectiveTimeoutMillis = (responseTimeoutMillis == null || responseTimeoutMillis <= 0L)
                ? null
                : responseTimeoutMillis;
        try {
            URI baseUri = URI.create(credential.baseUrl().trim());
            ResolvedProviderEndpoint endpoint = cancellation instanceof OverviewCancellation overviewCancellation
                    ? endpointPolicy.resolve(providerType, baseUri, effectiveTimeoutMillis, overviewCancellation)
                    : endpointPolicy.resolve(providerType, baseUri);
            JsonNode body;
            if (cancellation != null) {
                body = httpClient.postJsonCancellable(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class,
                        effectiveTimeoutMillis == null ? 10_000 : effectiveTimeoutMillis, cancellation,
                        overviewResponseByteLimit(request));
            } else if (!request.overviewCapacityRequest() && effectiveTimeoutMillis == null) {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class);
            } else if (!request.overviewCapacityRequest()) {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class, effectiveTimeoutMillis, cancellation);
            } else if (effectiveTimeoutMillis == null) {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class, cancellation,
                        overviewResponseByteLimit(request));
            } else {
                body = httpClient.postJson(endpoint, "/chat/completions", credential.apiKey(),
                        requestBody(request, credential), JsonNode.class,
                        effectiveTimeoutMillis, cancellation, overviewResponseByteLimit(request));
            }
            return parseResponse(body, request);
        } catch (DomainException exception) {
            throw exception;
        } catch (AiStreamAbortException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            throw providerError(exception.status(), exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        } catch (SocketTimeoutException exception) {
            throw new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
        } catch (IOException exception) {
            if (cancellation != null && cancellation.isCancelled()) {
                throw new AiStreamAbortException("Provider call was cancelled", exception);
            }
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
    public void streamInto(AiProviderRequest request, AiCredential credential,
                           AiProviderCallCancellation cancellation, Consumer<AiProviderChunk> sink) {
        validateCredential(credential);
        Objects.requireNonNull(sink, "sink");
        if (cancellation != null && cancellation.isCancelled()) {
            throw new AiStreamAbortException("Provider call was cancelled");
        }
        try {
            ResolvedProviderEndpoint endpoint = endpointPolicy.resolve(
                    providerType, URI.create(credential.baseUrl().trim()));
            Map<String, Object> body = new LinkedHashMap<>(requestBody(request, credential));
            body.put("stream", true);
            if (providerType == AiProviderType.OPENAI_COMPATIBLE) {
                body.put("stream_options", Map.of("include_usage", true));
            }
            StreamState state = new StreamState(!request.tools().isEmpty());
            httpClient.postStream(endpoint, "/chat/completions", credential.apiKey(), body,
                    line -> parseStreamLine(line, state, sink), cancellation);
            if (cancellation != null && cancellation.isCancelled()) {
                throw new AiStreamAbortException("Provider call was cancelled");
            }
            if (!state.done || state.finishReason == null) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an incomplete stream");
            }
            if (state.hasToolCallDeltas && !"tool_calls".equals(state.finishReason)) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid tool-call terminal");
            }
            sink.accept(new AiProviderChunk("", true, state.usage, state.modelIdentity,
                    state.responseId, null, null, state.finishReason, true));
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
            if (cancellation != null && cancellation.isCancelled()) {
                throw new AiStreamAbortException("Provider call was cancelled", exception);
            }
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
        body.put("messages", request.messages().stream().map(this::wireMessage).toList());
        if (!request.tools().isEmpty()) {
            body.put("tools", request.tools().stream().map(this::wireTool).toList());
        }
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
            boolean requestedThinking = request.thinkingEnabled() == null
                    ? thinkingEnabled : request.thinkingEnabled();
            body.put("thinking", Map.of("type", requestedThinking ? "enabled" : "disabled"));
        }
        return body;
    }

    private Map<String, Object> wireMessage(AiProviderRequest.Message message) {
        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("role", roleName(message.role()));
        if (message.content() != null) wire.put("content", message.content());
        if (!message.toolCalls().isEmpty()) {
            wire.put("tool_calls", message.toolCalls().stream().map(call -> Map.of(
                    "id", call.id(), "type", "function", "function", Map.of(
                            "name", call.name(), "arguments", call.argumentsJson()))).toList());
        }
        if (message.role() == AiMessageRole.TOOL) wire.put("tool_call_id", message.toolCallId());
        if (message.role() == AiMessageRole.ASSISTANT && message.reasoningContent() != null) {
            wire.put("reasoning_content", message.reasoningContent());
        }
        return wire;
    }

    private Map<String, Object> wireTool(AiProviderToolDefinition tool) {
        try {
            JsonNode schema = STREAM_OBJECT_MAPPER.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(tool.schemaJson());
            if (schema == null || !schema.isObject()) throw new IllegalArgumentException("Tool schema must be an object");
            Map<String, Object> function = new LinkedHashMap<>();
            function.put("name", tool.name());
            if (tool.description() != null && !tool.description().isBlank()) function.put("description", tool.description());
            function.put("parameters", schema);
            return Map.of("type", "function", "function", function);
        } catch (Exception exception) {
            throw new DomainException("AI_POLICY_CONTRACT_VIOLATION", "Tool definition is invalid", null, exception);
        }
    }

    private boolean supportsThinkingControl(AiCredential credential) {
        if (providerType == AiProviderType.DEEPSEEK) return true;
        if (providerType != AiProviderType.OPENAI_COMPATIBLE || credential == null
                || credential.baseUrl() == null) return false;
        try {
            String host = URI.create(credential.baseUrl().trim()).getHost();
            return "api.deepseek.com".equalsIgnoreCase(host) || "api.xiaomimimo.com".equalsIgnoreCase(host);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    protected AiProviderResponse parseResponse(JsonNode body, AiProviderRequest request) {
        JsonNode content = body == null ? null : body.path("choices").path(0).path("message").path("content");
        JsonNode message = body == null ? null : body.path("choices").path(0).path("message");
        List<AiProviderToolCall> toolCalls = parseToolCalls(message == null ? null : message.path("tool_calls"));
        boolean hasText = content != null && content.isTextual() && !content.asText().isBlank();
        if (!hasText && toolCalls.isEmpty()) {
            logInvalidResponseEnvelope(body, request);
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response");
        }
        if (!toolCalls.isEmpty() && request.tools().isEmpty()) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned unauthorized tool calls");
        }
        if (!toolCalls.isEmpty() && toolCalls.stream().anyMatch(call -> request.tools().stream()
                .noneMatch(tool -> tool.name().equals(call.name())))) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned unauthorized tool calls");
        }
        String finishReason = normalizedFinishReason(body);
        if (!toolCalls.isEmpty() && !"tool_calls".equals(finishReason)) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid tool-call terminal");
        }
        JsonNode usage = body.path("usage");
        return new AiProviderResponse(
                hasText ? content.asText() : "",
                tokenCount(usage, "prompt_tokens"),
                tokenCount(usage, "completion_tokens"),
                finishReason,
                responseModelIdentity(body), toolCalls);
    }

    private List<AiProviderToolCall> parseToolCalls(JsonNode calls) {
        if (calls == null || calls.isMissingNode() || calls.isNull()) return List.of();
        if (!calls.isArray()) throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned invalid tool calls");
        List<AiProviderToolCall> result = new ArrayList<>();
        HashSet<String> ids = new HashSet<>();
        for (JsonNode call : calls) {
            String id = call.path("id").asString(null);
            String name = call.path("function").path("name").asString(null);
            String arguments = call.path("function").path("arguments").asString(null);
            if (id == null || name == null || arguments == null || !ids.add(id)) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned invalid tool calls");
            }
            requireObjectArguments(arguments);
            result.add(new AiProviderToolCall(id, name, arguments));
        }
        return List.copyOf(result);
    }

    private void requireObjectArguments(String arguments) {
        try {
            JsonNode parsed = STREAM_OBJECT_MAPPER.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(arguments);
            if (parsed == null || !parsed.isObject()) {
                throw new IllegalArgumentException("Tool arguments must be an object");
            }
        } catch (Exception exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned invalid tool arguments", null,
                    exception);
        }
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

    private void parseStreamLine(String line, StreamState state, Consumer<AiProviderChunk> sink) {
        if (line == null || line.isBlank() || !line.startsWith("data:")) {
            return;
        }
        String payload = line.substring("data:".length()).trim();
        if (payload.equals("[DONE]")) {
            state.done = true;
            return;
        }
        JsonNode body;
        try {
            body = STREAM_OBJECT_MAPPER.readTree(payload);
        } catch (Exception exception) {
            throw ProviderStreamDiagnosticException.providerFrameJson(exception);
        }
        try {
            JsonNode responseId = body == null ? null : body.path("id");
            if (responseId != null && responseId.isTextual()) state.responseId = responseId.asString();
            AiProviderModelIdentity modelIdentity = responseModelIdentity(body);
            state.modelIdentity = state.modelIdentity.merge(modelIdentity);
            AiTokenUsage usage = parseUsage(body == null ? null : body.path("usage"));
            if (usage != null) state.usage = usage;
            JsonNode choices = body == null ? null : body.path("choices");
            if ((choices == null || !choices.isArray() || choices.isEmpty()) && usage != null) {
                return;
            }
            JsonNode choice = body.path("choices").path(0);
            JsonNode delta = choice.path("delta");
            JsonNode content = delta.path("content");
            JsonNode reasoningContent = delta.path("reasoning_content");
            JsonNode toolDeltas = delta.path("tool_calls");
            JsonNode finishReason = choice.path("finish_reason");
            String nextFinishReason = finishReason.isMissingNode() || finishReason.isNull()
                    ? null : normalizedStreamFinishReason(finishReason);
            if (state.lockToolFinishReason && state.finishReason != null) {
                if (hasNonemptyStreamDelta(content, reasoningContent, toolDeltas)) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid tool stream");
                }
                if (nextFinishReason != null && !state.finishReason.equals(nextFinishReason)) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid tool stream");
                }
            }
            boolean emitted = false;
            if (content.isTextual() && !content.asText().isEmpty()) {
                emitStreamChunk(sink, new AiProviderChunk(content.asText(), false, null, modelIdentity));
                emitted = true;
            }
            if (reasoningContent.isTextual()) {
                emitStreamChunk(sink, new AiProviderChunk("", false, null, modelIdentity, state.responseId,
                        null, null, null, false, reasoningContent.asText()));
                emitted = true;
            }
            if (toolDeltas.isArray()) {
                for (JsonNode toolDelta : toolDeltas) {
                    JsonNode indexNode = toolDelta.path("index");
                    if (!indexNode.isIntegralNumber() || !indexNode.canConvertToInt() || indexNode.intValue() < 0) {
                        throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned invalid tool-call index");
                    }
                    int index = indexNode.intValue();
                    String id = toolDelta.path("id").asString(null);
                    String name = toolDelta.path("function").path("name").asString(null);
                    JsonNode arguments = toolDelta.path("function").path("arguments");
                    String argumentsFragment = arguments.isTextual() ? arguments.asString() : null;
                    if (id != null || name != null || argumentsFragment != null) {
                        state.hasToolCallDeltas = true;
                        emitStreamChunk(sink, new AiProviderChunk("", false, null, modelIdentity,
                                state.responseId, index,
                                new AiProviderToolCallDelta(id, name, argumentsFragment), null, false));
                        emitted = true;
                    }
                }
            }
            if (nextFinishReason != null) {
                if (state.lockToolFinishReason) {
                    if (state.finishReason == null) state.finishReason = nextFinishReason;
                } else {
                    state.finishReason = nextFinishReason;
                }
                emitted = true;
            }
            if (!emitted && modelIdentity.status() != AiProviderModelIdentity.Status.MISSING) {
                emitStreamChunk(sink, new AiProviderChunk("", false, null, modelIdentity));
            }
        } catch (AiStreamAbortException exception) {
            throw exception;
        } catch (ProviderStreamDiagnosticException exception) {
            throw exception;
        } catch (DomainException exception) {
            throw ProviderStreamDiagnosticException.providerFrameProtocol(exception);
        } catch (Exception exception) {
            throw ProviderStreamDiagnosticException.providerFrameProtocol(exception);
        }
    }

    private void emitStreamChunk(Consumer<AiProviderChunk> sink, AiProviderChunk chunk) {
        try {
            sink.accept(chunk);
        } catch (AiStreamAbortException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw ProviderStreamDiagnosticException.consumerCallback(exception);
        }
    }

    private String normalizedStreamFinishReason(JsonNode value) {
        if (!value.isTextual()) return "other";
        return switch (value.asString()) {
            case "stop", "tool_calls", "length", "content_filter" -> value.asString();
            default -> "other";
        };
    }

    private boolean hasNonemptyStreamDelta(JsonNode content, JsonNode reasoningContent, JsonNode toolDeltas) {
        if (content != null && content.isTextual() && !content.asString().isEmpty()) return true;
        if (reasoningContent != null && reasoningContent.isTextual() && !reasoningContent.asString().isEmpty()) {
            return true;
        }
        if (toolDeltas == null || !toolDeltas.isArray()) return false;
        for (JsonNode toolDelta : toolDeltas) {
            if (nonemptyText(toolDelta.path("id")) || nonemptyText(toolDelta.path("function").path("name"))
                    || nonemptyText(toolDelta.path("function").path("arguments"))) return true;
        }
        return false;
    }

    private boolean nonemptyText(JsonNode value) {
        return value != null && value.isTextual() && !value.asString().isEmpty();
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

    private static final class StreamState {
        private final boolean lockToolFinishReason;
        private String responseId;
        private String finishReason;
        private boolean done;
        private boolean hasToolCallDeltas;
        private AiTokenUsage usage;
        private AiProviderModelIdentity modelIdentity = AiProviderModelIdentity.missing();

        private StreamState(boolean lockToolFinishReason) {
            this.lockToolFinishReason = lockToolFinishReason;
        }
    }

}
