package com.auralis.app.ai.internal.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;

@FunctionalInterface
public interface ProviderHttpTransport {

    byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody)
            throws IOException;

    default void postStream(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            Consumer<String> lineConsumer) throws IOException {
        byte[] response = post(endpoint, path, apiKey, requestBody);
        if (response == null) {
            return;
        }
        String text = new String(response, StandardCharsets.UTF_8);
        for (String line : text.split("\\R", -1)) {
            lineConsumer.accept(line);
        }
    }
}
