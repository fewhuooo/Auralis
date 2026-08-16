package com.auralis.app.ai;

import java.util.List;

public interface EmbeddingProviderPort {

    AiProviderType type();

    EmbeddingResult embed(List<String> texts, AiCredential credential);
}
