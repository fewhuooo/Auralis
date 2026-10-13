package com.auralis.app.ai;

import java.net.URI;
import java.net.URISyntaxException;
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
        boolean verifiedOpenAi = provider == AiProviderType.OPENAI_COMPATIBLE
                && VERIFIED_MODEL.equals(exactModel)
                && isTrustedOfficialEndpoint(endpointBaseUrl);
        boolean verifiedDeepSeek = provider == AiProviderType.DEEPSEEK
                && VERIFIED_DEEPSEEK_MODEL.equals(exactModel)
                && isTrustedDeepSeekEndpoint(endpointBaseUrl);
        boolean verified = verifiedOpenAi || verifiedDeepSeek;
        return new OverviewModelBudget(provider, exactModel, verified,
                verifiedOpenAi ? VERIFIED_CONTEXT_TOKENS
                        : verifiedDeepSeek ? VERIFIED_DEEPSEEK_CONTEXT_TOKENS : 0,
                verifiedOpenAi ? VERIFIED_MAX_OUTPUT_TOKENS
                        : verifiedDeepSeek ? VERIFIED_DEEPSEEK_MAX_OUTPUT_TOKENS : 0);
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
}
