package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiProviderType;
import org.springframework.stereotype.Component;

@Component
public class DeepSeekAiProvider extends OpenAiCompatibleProvider {

    public DeepSeekAiProvider() {
        super(AiProviderType.DEEPSEEK);
    }
}
