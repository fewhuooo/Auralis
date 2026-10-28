package com.auralis.app.ai.usage;

/** Actual credential provenance resolved by AiSettingsService for each provider invocation. */
public enum AiCredentialSource {
    PLATFORM,
    USER_SUPPLIED,
    LEGACY_UNKNOWN;

    public static AiCredentialSource requireKnown(AiCredentialSource source) {
        if (source == null || source == LEGACY_UNKNOWN) throw new AiPolicyContractException();
        return source;
    }
}
