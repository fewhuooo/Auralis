package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import org.springframework.stereotype.Component;

@Component
public class SiliconFlowAiProvider extends OpenAiCompatibleProvider {

    public SiliconFlowAiProvider(ProviderEndpointPolicy endpointPolicy, ProviderHttpClient httpClient) {
        super(AiProviderType.SILICONFLOW, endpointPolicy, httpClient);
    }
}
