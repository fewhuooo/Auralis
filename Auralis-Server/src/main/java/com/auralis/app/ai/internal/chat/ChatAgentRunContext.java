package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.usage.AiCredentialSource;

import java.util.Objects;
import java.util.UUID;

/** Immutable model adapter context captured by one Chat logical run attempt. */
public record ChatAgentRunContext(
        UUID userId,
        UUID runId,
        UUID attemptId,
        UUID budgetTaskId,
        long ownerFence,
        AiProviderType provider,
        String model,
        AiCredential credential,
        AiCredentialSource credentialSource,
        AiProviderCallCancellation cancellation) {
    public ChatAgentRunContext {
        Objects.requireNonNull(userId);
        Objects.requireNonNull(runId);
        Objects.requireNonNull(attemptId);
        Objects.requireNonNull(budgetTaskId);
        if (!runId.equals(budgetTaskId)) {
            throw new IllegalArgumentException("Chat Agent budget identity must be the raw logical run id");
        }
        Objects.requireNonNull(provider);
        if (model == null || model.isBlank()) throw new IllegalArgumentException("Model is required");
        Objects.requireNonNull(credential);
        AiCredentialSource.requireKnown(credentialSource);
        Objects.requireNonNull(cancellation);
    }
}
