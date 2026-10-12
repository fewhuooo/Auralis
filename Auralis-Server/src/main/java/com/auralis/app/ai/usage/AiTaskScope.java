package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.OverviewCancellation;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

public interface AiTaskScope extends AutoCloseable {

    <T> AiInvocationResult<T> metadata(
            AiStage stage, AiProviderType provider, String model, Supplier<T> operation);

    AiInvocationResult<AiProviderResponse> complete(
            AiStage stage, AiProviderType provider, AiProviderRequest request,
            AiCredential credential, long responseTimeoutMillis);

    default AiInvocationResult<AiProviderResponse> complete(
            AiStage stage, AiProviderType provider, AiProviderRequest request,
            AiCredential credential, long responseTimeoutMillis, OverviewCancellation cancellation) {
        return complete(stage, provider, request, credential, responseTimeoutMillis);
    }

    AiInvocationResult<Void> stream(
            AiStage stage, AiProviderType provider, AiProviderRequest request,
            AiCredential credential, Consumer<AiProviderChunk> sink);

    AiInvocationResult<EmbeddingResult> embed(
            AiStage stage, AiProviderType provider, String model, List<String> texts,
            AiCredential credential);

    AiProviderUsage usage();

    @Override
    void close();
}
