package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class AiProviderRegistry {

    private final Map<AiProviderType, AiProviderPort> providers;

    public AiProviderRegistry(List<AiProviderPort> providers) {
        this.providers = new EnumMap<>(AiProviderType.class);
        providers.forEach(provider -> this.providers.put(provider.type(), provider));
    }

    public AiProviderPort require(AiProviderType type) {
        AiProviderPort provider = providers.get(type);
        if (provider == null) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider is not available");
        }
        return provider;
    }
}
