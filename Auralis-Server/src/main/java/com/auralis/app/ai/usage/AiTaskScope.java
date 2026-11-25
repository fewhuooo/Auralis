package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.AiProviderCallCancellation;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.UUID;

public interface AiTaskScope extends AutoCloseable {

    UUID taskId();
    default <T> AiInvocationResult<T> metadata(AiStage stage, AiProviderType provider, String model,
            AiCredentialSource source, Supplier<T> operation) {
        throw new AiPolicyContractException();
    }
    default AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
            AiProviderRequest request, AiCredential credential, AiCredentialSource source,
            long responseTimeoutMillis, AiOutputRole role) {
        return complete(stage, provider, request, credential, source, responseTimeoutMillis, role, null);
    }

    default AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
            AiProviderRequest request, AiCredential credential, AiCredentialSource source,
            long responseTimeoutMillis, AiOutputRole role, OverviewCancellation cancellation) {
        throw new AiPolicyContractException();
    }

    default AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
            AiProviderRequest request, AiCredential credential, AiCredentialSource source,
            long responseTimeoutMillis, AiOutputRole role, OverviewCancellation cancellation,
            AiInvocationBinding binding) {
        throw new AiPolicyContractException();
    }

    default AiInvocationResult<AiProviderResponse> completeChat(AiStage stage, AiProviderType provider,
            AiProviderRequest request, AiCredential credential, AiCredentialSource source,
            long responseTimeoutMillis, AiProviderCallCancellation cancellation) {
        throw new AiPolicyContractException();
    }
    default AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
            AiProviderRequest request, AiCredential credential, AiCredentialSource source,
            Consumer<AiProviderChunk> sink) {
        throw new AiPolicyContractException();
    }

    default AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
            AiProviderRequest request, AiCredential credential, AiCredentialSource source,
            AiProviderCallCancellation cancellation, Consumer<AiProviderChunk> sink) {
        throw new AiPolicyContractException();
    }
    default AiInvocationResult<EmbeddingResult> embed(AiStage stage, AiProviderType provider,
            String model, List<String> texts, AiCredential credential, AiCredentialSource source) {
        throw new AiPolicyContractException();
    }

    AiProviderUsage usage();

    AiProviderUsage usage(AiCredentialSource source);

    default AiPlatformTaskBudgetUsage platformTaskBudgetUsage() {
        throw new AiPolicyContractException();
    }

    @Override
    void close();
}
