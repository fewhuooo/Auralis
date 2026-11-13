package com.auralis.app.ai;

import java.util.function.Consumer;

public interface AiProviderPort {

    AiProviderType type();

    AiProviderResponse complete(AiProviderRequest request, AiCredential credential);

    /**
     * Completes a non-streaming request with an explicit provider response/read timeout.
     * Providers that do not need a separate timeout retain the compatibility behavior.
     */
    default AiProviderResponse complete(
            AiProviderRequest request,
            AiCredential credential,
            long responseTimeoutMillis) {
        return complete(request, credential);
    }

    default AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                        long responseTimeoutMillis, OverviewCancellation cancellation) {
        if (cancellation != null && cancellation.isCancelled()) {
            throw new com.auralis.app.shared.error.DomainException("MODEL_TIMEOUT", "Overview generation was cancelled");
        }
        return complete(request, credential, responseTimeoutMillis);
    }

    /** Chat completion entry point with run-owned cancellation; existing Overview overloads remain unchanged. */
    default AiProviderResponse completeChat(AiProviderRequest request, AiCredential credential,
                                            long responseTimeoutMillis,
                                            AiProviderCallCancellation cancellation) {
        if (cancellation != null && cancellation.isCancelled()) {
            throw new com.auralis.app.ai.AiStreamAbortException("Provider call was cancelled");
        }
        AiProviderResponse response = complete(request, credential, responseTimeoutMillis);
        if (cancellation != null && cancellation.isCancelled()) {
            throw new com.auralis.app.ai.AiStreamAbortException("Provider call was cancelled");
        }
        return response;
    }

    /** Chat-aware streaming entry point. Providers should bind cancellation to the active transport reader. */
    default void streamInto(AiProviderRequest request, AiCredential credential,
                            AiProviderCallCancellation cancellation, Consumer<AiProviderChunk> sink) {
        throw new UnsupportedOperationException("Provider does not support streaming");
    }
}
