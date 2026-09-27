package com.auralis.app.ai;

import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderResponseTooLargeException;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AiProviderDiscoveryService {

    private static final int MAX_RETURNED_MODELS = 200;

    private final AiSettingsService settingsService;
    private final ProviderEndpointPolicy endpointPolicy;
    private final ProviderHttpClient httpClient;

    public AiProviderDiscoveryService(AiSettingsService settingsService,
            ProviderEndpointPolicy endpointPolicy, ProviderHttpClient httpClient) {
        this.settingsService = settingsService;
        this.endpointPolicy = endpointPolicy;
        this.httpClient = httpClient;
    }

    public AiModelListView listModels(UUID userId, AiProviderType provider) {
        return new AiModelListView(provider, loadModels(userId, provider));
    }

    public AiConnectionTestView testConnection(UUID userId, AiProviderType provider) {
        AiSettingsService.ResolvedSettings saved = settingsService.requireSavedByok(userId, provider);
        ResolvedProviderEndpoint endpoint = resolveEndpoint(provider, saved);
        Map<String, Object> request = Map.of(
                "model", saved.chatModel(),
                "messages", List.of(Map.of("role", "user", "content", "Reply with OK.")),
                "max_tokens", 1);
        try {
            JsonNode response = httpClient.postJson(
                    endpoint, "/chat/completions", saved.credential().apiKey(), request, JsonNode.class);
            JsonNode choices = response == null ? null : response.path("choices");
            if (choices == null || !choices.isArray() || choices.isEmpty()) {
                throw new DomainException("MODEL_PROVIDER_ERROR",
                        "AI provider returned an invalid chat completion response");
            }
            return new AiConnectionTestView(provider, true, saved.chatModel());
        } catch (DomainException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            throw mapChatTestStatus(exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid response", null,
                    exception);
        } catch (SocketTimeoutException exception) {
            throw new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
        } catch (IOException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        }
    }

    private List<String> loadModels(UUID userId, AiProviderType provider) {
        AiSettingsService.ResolvedSettings saved = settingsService.requireSavedByok(userId, provider);
        ResolvedProviderEndpoint endpoint = resolveEndpoint(provider, saved);
        try {
            JsonNode response = httpClient.getJson(endpoint, "/models", saved.credential().apiKey(), JsonNode.class);
            JsonNode data = response == null ? null : response.path("data");
            if (data == null || !data.isArray()) {
                throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid model list");
            }
            LinkedHashSet<String> models = new LinkedHashSet<>();
            for (JsonNode item : data) {
                if (item == null || !item.isObject()) continue;
                JsonNode id = item.path("id");
                if (!id.isTextual()) continue;
                String model = id.asText().trim();
                if (!model.isEmpty() && model.length() <= 240 && models.size() < MAX_RETURNED_MODELS) {
                    models.add(model);
                }
            }
            return List.copyOf(new ArrayList<>(models));
        } catch (DomainException exception) {
            throw exception;
        } catch (ProviderHttpException exception) {
            throw mapStatus(exception);
        } catch (ProviderResponseTooLargeException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid model list", null,
                    exception);
        } catch (SocketTimeoutException exception) {
            throw new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
        } catch (IOException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        }
    }

    private ResolvedProviderEndpoint resolveEndpoint(AiProviderType provider,
            AiSettingsService.ResolvedSettings saved) {
        URI baseUri;
        try {
            baseUri = URI.create(saved.credential().baseUrl().trim());
        } catch (RuntimeException exception) {
            throw new DomainException("VALIDATION_FAILED", "Saved AI provider URL is invalid");
        }
        return endpointPolicy.resolve(provider, baseUri);
    }

    private DomainException mapChatTestStatus(ProviderHttpException exception) {
        int status = exception.status();
        if (status == 408) {
            return new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
        }
        if (status == 429) {
            return new DomainException("RATE_LIMITED", "AI provider rate limit reached", null, exception);
        }
        if (status >= 500) {
            return new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        }
        return new DomainException("MODEL_PROVIDER_ERROR",
                "AI provider rejected the selected chat model or request", null, exception);
    }

    private DomainException mapStatus(ProviderHttpException exception) {
        int status = exception.status();
        if (status == 408) {
            return new DomainException("MODEL_TIMEOUT", "AI provider response timed out", null, exception);
        }
        if (status == 429) {
            return new DomainException("RATE_LIMITED", "AI provider rate limit reached", null, exception);
        }
        if (status >= 500) {
            return new DomainException("MODEL_UNAVAILABLE", "AI provider is unavailable", null, exception);
        }
        if (status == 404) {
            return new DomainException("MODEL_PROVIDER_ERROR",
                    "AI provider does not expose the OpenAI-compatible models endpoint", null, exception);
        }
        return new DomainException("MODEL_PROVIDER_ERROR", "AI provider rejected the saved credentials", null,
                exception);
    }

    public record AiModelListView(AiProviderType provider, List<String> models) {
        public AiModelListView {
            models = List.copyOf(models);
        }
    }

    public record AiConnectionTestView(AiProviderType provider, boolean reachable, String chatModel) {
    }
}
