package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import org.springframework.stereotype.Component;

@Component
public class DeepSeekAiProvider extends OpenAiCompatibleProvider {

    public DeepSeekAiProvider(ProviderEndpointPolicy endpointPolicy, ProviderHttpClient httpClient) {
        super(AiProviderType.DEEPSEEK, endpointPolicy, httpClient);
    }
}
