package com.auralis.app.ai;

import com.auralis.app.shared.config.AuralisProperties;

import com.auralis.app.ai.usage.AiCredentialSource;
import java.util.OptionalLong;

/** Verified model capability profile. Unknown/custom endpoints deliberately have no inferred limits. */
public final class OverviewModelBudget {
    public static final long DEFAULT_CONTEXT_SAFETY_MARGIN_TOKENS = 8_192;

    private final AiProviderType provider;
    private final String exactModel;
    private final boolean trusted;
    private final long contextWindowTokens;
    private final long maxOutputTokens;

    private OverviewModelBudget(AiProviderType provider, String exactModel, boolean trusted,
                                long contextWindowTokens, long maxOutputTokens) {
        this.provider = provider;
        this.exactModel = exactModel == null ? "" : exactModel;
        this.trusted = trusted;
        this.contextWindowTokens = contextWindowTokens;
        this.maxOutputTokens = maxOutputTokens;
    }

    public static OverviewModelBudget resolve(AiProviderType provider, String endpoint, String model,
                                              AiCredentialSource source, AuralisProperties.Ai ai) {
        if (ai == null || provider == null || endpoint == null || model == null) {
            return unknown(provider, endpoint, model);
        }
        if (source == AiCredentialSource.PLATFORM) {
            AuralisProperties.GenerationEndpoint generation = ai.generation();
            if (provider == AiProviderType.OPENAI_COMPATIBLE && generation != null
                    && endpoint.equals(generation.baseUrl()) && model.equals(generation.model())
                    && generation.contextTokens() > 0) {
                return new OverviewModelBudget(provider, model, true,
                        generation.contextTokens(), generation.maxOutputTokens());
            }
            return unknown(provider, endpoint, model);
        }
        if (source == AiCredentialSource.USER_SUPPLIED) {
            for (AuralisProperties.OverviewModelCapacity configured : ai.overviewModelCapacities()) {
                if (provider.name().equals(configured.provider()) && endpoint.equals(configured.endpoint())
                        && model.equals(configured.model())) {
                    return new OverviewModelBudget(provider, model, true,
                            configured.contextWindowTokens(), configured.maxOutputTokens());
                }
            }
        }
        return unknown(provider, endpoint, model);
    }

    public static OverviewModelBudget unknown(AiProviderType provider, String endpointBaseUrl,
                                              String exactModel) {
        return new OverviewModelBudget(provider, exactModel, false, 0, 0);
    }

    public AiProviderType provider() {
        return provider;
    }

    public String exactModel() {
        return exactModel;
    }

    public boolean isTrusted() {
        return trusted;
    }

    public OptionalLong contextWindowTokens() {
        return trusted ? OptionalLong.of(contextWindowTokens) : OptionalLong.empty();
    }

    public OptionalLong maxOutputTokens() {
        return trusted ? OptionalLong.of(maxOutputTokens) : OptionalLong.empty();
    }

    /** Keeps the shared context reserve proportional for explicitly configured small windows. */
    public long contextSafetyMarginTokens() {
        if (!trusted || contextWindowTokens < 1) return 0;
        return Math.min(DEFAULT_CONTEXT_SAFETY_MARGIN_TOKENS, contextWindowTokens / 4);
    }
}
