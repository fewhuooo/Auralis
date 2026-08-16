package com.auralis.app.ai.internal.security;

import java.io.IOException;

@FunctionalInterface
public interface ProviderHttpTransport {

    byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody)
            throws IOException;
}
