package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class EmbeddingProviderRegistry {

    private final Map<AiProviderType, EmbeddingProviderPort> providers;

    public EmbeddingProviderRegistry(List<EmbeddingProviderPort> providers) {
        this.providers = new EnumMap<>(AiProviderType.class);
        providers.forEach(provider -> this.providers.put(provider.type(), provider));
    }

    public EmbeddingProviderPort require(AiProviderType type) {
        EmbeddingProviderPort provider = providers.get(type);
        if (provider == null) {
            throw new DomainException("MODEL_UNAVAILABLE", "Embedding provider is not available");
        }
        return provider;
    }
}
