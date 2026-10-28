package com.auralis.app.ai;

import com.auralis.app.shared.config.AuralisProperties;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.OptionalLong;

/** Verified model capability profile. Unknown/custom endpoints deliberately have no inferred limits. */
public final class OverviewModelBudget {
    private static final String OPENAI_HOST = "api.openai.com";
    private static final String OPENAI_PATH = "/v1";
    private static final String VERIFIED_MODEL = "gpt-4o-mini";
    private static final long VERIFIED_CONTEXT_TOKENS = 128_000;
    private static final long VERIFIED_MAX_OUTPUT_TOKENS = 16_384;
    private static final String DEEPSEEK_HOST = "api.deepseek.com";
    private static final String VERIFIED_DEEPSEEK_MODEL = "deepseek-v4-flash";
    private static final long VERIFIED_DEEPSEEK_CONTEXT_TOKENS = 1_000_000;
    private static final long VERIFIED_DEEPSEEK_MAX_OUTPUT_TOKENS = 384_000;
    private static final String MIMO_HOST = "api.xiaomimimo.com";
    private static final String MIMO_PATH = "/v1";
    // Official model page reports a 1M context window and 128K max output:
    // https://mimo.mi.com/models/en-US/mimo-v2.6-flash
    private static final String VERIFIED_MIMO_MODEL = "mimo-v2.6-flash";
    private static final long VERIFIED_MIMO_CONTEXT_TOKENS = 1_000_000;
    private static final long VERIFIED_MIMO_MAX_OUTPUT_TOKENS = 128_000;
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

    public static OverviewModelBudget resolve(AiProviderType provider, String endpointBaseUrl,
                                              String exactModel) {
        return resolve(provider, endpointBaseUrl, exactModel, List.of());
    }

    public static OverviewModelBudget resolve(AiProviderType provider, String endpointBaseUrl,
                                              String exactModel,
                                              List<AuralisProperties.OverviewModelCapacity> configuredCapacities) {
        boolean verifiedOpenAi = provider == AiProviderType.OPENAI_COMPATIBLE
                && VERIFIED_MODEL.equals(exactModel)
                && isTrustedOfficialEndpoint(endpointBaseUrl);
        boolean verifiedDeepSeek = provider == AiProviderType.DEEPSEEK
                && VERIFIED_DEEPSEEK_MODEL.equals(exactModel)
                && isTrustedDeepSeekEndpoint(endpointBaseUrl);
        boolean verifiedMimo = provider == AiProviderType.OPENAI_COMPATIBLE
                && VERIFIED_MIMO_MODEL.equals(exactModel)
                && isTrustedMimoEndpoint(endpointBaseUrl);
        AuralisProperties.OverviewModelCapacity configured = findConfiguredCapacity(
                provider, endpointBaseUrl, exactModel, configuredCapacities);
        // An exact server profile reflects the operator's current model contract and takes precedence.
        boolean verified = configured != null || verifiedOpenAi || verifiedDeepSeek || verifiedMimo;
        return new OverviewModelBudget(provider, exactModel, verified,
                configured != null ? configured.contextWindowTokens()
                        : verifiedOpenAi ? VERIFIED_CONTEXT_TOKENS
                        : verifiedDeepSeek ? VERIFIED_DEEPSEEK_CONTEXT_TOKENS
                        : verifiedMimo ? VERIFIED_MIMO_CONTEXT_TOKENS
                        : 0,
                configured != null ? configured.maxOutputTokens()
                        : verifiedOpenAi ? VERIFIED_MAX_OUTPUT_TOKENS
                        : verifiedDeepSeek ? VERIFIED_DEEPSEEK_MAX_OUTPUT_TOKENS
                        : verifiedMimo ? VERIFIED_MIMO_MAX_OUTPUT_TOKENS
                        : 0);
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

    private static boolean isTrustedOfficialEndpoint(String endpointBaseUrl) {
        if (endpointBaseUrl == null || endpointBaseUrl.isBlank()) {
            return false;
        }
        try {
            URI uri = new URI(endpointBaseUrl.trim());
            return "https".equalsIgnoreCase(uri.getScheme())
                    && OPENAI_HOST.equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && (OPENAI_PATH.equals(uri.getPath()) || (OPENAI_PATH + "/").equals(uri.getPath()))
                    && uri.getUserInfo() == null
                    && uri.getQuery() == null
                    && uri.getFragment() == null;
        } catch (URISyntaxException | IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean isTrustedDeepSeekEndpoint(String endpointBaseUrl) {
        if (endpointBaseUrl == null || endpointBaseUrl.isBlank()) {
            return false;
        }
        try {
            URI uri = new URI(endpointBaseUrl.trim());
            return "https".equalsIgnoreCase(uri.getScheme())
                    && DEEPSEEK_HOST.equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                    && uri.getUserInfo() == null
                    && uri.getQuery() == null
                    && uri.getFragment() == null;
        } catch (URISyntaxException | IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean isTrustedMimoEndpoint(String endpointBaseUrl) {
        if (endpointBaseUrl == null || endpointBaseUrl.isBlank()) return false;
        try {
            URI uri = new URI(endpointBaseUrl.trim());
            return "https".equalsIgnoreCase(uri.getScheme())
                    && MIMO_HOST.equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && (MIMO_PATH.equals(uri.getPath()) || (MIMO_PATH + "/").equals(uri.getPath()))
                    && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
        } catch (URISyntaxException | IllegalArgumentException ignored) {
            return false;
        }
    }

    private static AuralisProperties.OverviewModelCapacity findConfiguredCapacity(
            AiProviderType provider, String endpointBaseUrl, String exactModel,
            List<AuralisProperties.OverviewModelCapacity> configuredCapacities) {
        if (provider == null || endpointBaseUrl == null || exactModel == null || configuredCapacities == null) {
            return null;
        }
        return configuredCapacities.stream()
                .filter(capacity -> capacity != null
                        && provider.name().equals(capacity.provider())
                        && capacity.endpoint().equals(endpointBaseUrl)
                        && capacity.model().equals(exactModel))
                .findFirst().orElse(null);
    }
}
