package com.auralis.app.ai;

import java.util.List;

public interface AiProviderPort {

    AiProviderType type();

    AiProviderResponse complete(AiProviderRequest request, AiCredential credential);

    default List<AiProviderChunk> stream(AiProviderRequest request, AiCredential credential) {
        AiProviderResponse response = complete(request, credential);
        return List.of(new AiProviderChunk(response.content(), true));
    }
}
