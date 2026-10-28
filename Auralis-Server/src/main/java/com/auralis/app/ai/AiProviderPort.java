package com.auralis.app.ai;

import java.util.List;
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

    default List<AiProviderChunk> stream(AiProviderRequest request, AiCredential credential) {
        AiProviderResponse response = complete(request, credential);
        return List.of(new AiProviderChunk(response.content(), true, response.usage(), response.modelIdentity()));
    }

    /**
     * Streams provider chunks directly to the caller. The list-returning method remains as a
     * compatibility fallback for simple providers and test doubles.
     */
    default void streamInto(
            AiProviderRequest request,
            AiCredential credential,
            Consumer<AiProviderChunk> sink) {
        List<AiProviderChunk> chunks = stream(request, credential);
        if (chunks != null) {
            chunks.forEach(sink);
        }
    }
}
