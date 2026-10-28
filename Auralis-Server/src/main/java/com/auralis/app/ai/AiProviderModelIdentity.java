package com.auralis.app.ai;

import java.util.Locale;
import java.util.Objects;

/** Safe, internal metadata describing a model identifier actually present in a provider response. */
public record AiProviderModelIdentity(String modelId, Status status) {
    public static final String UNKNOWN_MODEL = "unknown";
    private static final int MAX_MODEL_ID_CHARS = 80;

    public enum Status {
        OBSERVED,
        MISSING,
        INVALID,
        CONFLICT
    }

    public AiProviderModelIdentity {
        Objects.requireNonNull(status, "status");
        if (status != Status.OBSERVED || !isSafeIdentifier(modelId)) {
            if (status == Status.OBSERVED) status = Status.INVALID;
            modelId = UNKNOWN_MODEL;
        }
    }

    public static AiProviderModelIdentity missing() {
        return new AiProviderModelIdentity(UNKNOWN_MODEL, Status.MISSING);
    }

    public static AiProviderModelIdentity invalid() {
        return new AiProviderModelIdentity(UNKNOWN_MODEL, Status.INVALID);
    }

    public static AiProviderModelIdentity fromProviderValue(String value) {
        return isSafeIdentifier(value)
                ? new AiProviderModelIdentity(value, Status.OBSERVED)
                : invalid();
    }

    public static String safeRequestedModel(String value) {
        return isSafeIdentifier(value) ? value : UNKNOWN_MODEL;
    }

    /** Merge response observations without ever allowing an invalid or conflicting value to recover. */
    public AiProviderModelIdentity merge(AiProviderModelIdentity next) {
        if (next == null || next.status == Status.MISSING) return this;
        if (status == Status.CONFLICT || next.status == Status.CONFLICT) return conflict();
        if (status == Status.INVALID || next.status == Status.INVALID) return invalid();
        if (status == Status.OBSERVED && next.status == Status.OBSERVED) {
            return modelId.equals(next.modelId) ? this : conflict();
        }
        return next.status == Status.OBSERVED ? next : this;
    }

    private static AiProviderModelIdentity conflict() {
        return new AiProviderModelIdentity(UNKNOWN_MODEL, Status.CONFLICT);
    }

    private static boolean isSafeIdentifier(String value) {
        if (value == null || value.isEmpty() || value.length() > MAX_MODEL_ID_CHARS
                || !value.matches("[A-Za-z0-9][A-Za-z0-9._/-]*")) return false;
        int slash = value.indexOf('/');
        if (slash > 0 && value.substring(0, slash).contains(".")) return false;
        String lower = value.toLowerCase(Locale.ROOT);
        return !lower.startsWith("sk-") && !lower.startsWith("sk_")
                && !lower.startsWith("pk-") && !lower.startsWith("pk_")
                && !lower.startsWith("rk-") && !lower.startsWith("rk_")
                && !lower.startsWith("api-key-") && !lower.startsWith("apikey-")
                && !lower.startsWith("bearer-") && !lower.startsWith("token-");
    }
}
