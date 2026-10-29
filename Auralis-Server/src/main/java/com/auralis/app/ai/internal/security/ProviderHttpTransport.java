package com.auralis.app.ai.internal.security;

import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.AiProviderCallCancellation;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;

@FunctionalInterface
public interface ProviderHttpTransport {

    byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody)
            throws IOException;

    default byte[] get(ResolvedProviderEndpoint endpoint, String path, String apiKey,
            long connectTimeoutMillis, long responseTimeoutMillis) throws IOException {
        throw new IOException("Provider GET is not supported by this transport");
    }

    default byte[] post(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            long connectTimeoutMillis,
            long responseTimeoutMillis) throws IOException {
        return post(endpoint, path, apiKey, requestBody);
    }

    default byte[] postCancellable(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            long connectTimeoutMillis,
            long responseTimeoutMillis,
            AiProviderCallCancellation cancellation,
            long maxResponseBytes) throws IOException {
        if (cancellation != null && cancellation.isCancelled()) throw new IOException("Provider call was cancelled");
        byte[] response = post(endpoint, path, apiKey, requestBody, connectTimeoutMillis, responseTimeoutMillis);
        if (cancellation != null && cancellation.isCancelled()) throw new IOException("Provider call was cancelled");
        return response;
    }

    default byte[] post(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            long connectTimeoutMillis,
            long responseTimeoutMillis,
            OverviewCancellation cancellation) throws IOException {
        if (cancellation != null && cancellation.isCancelled()) throw new IOException("Provider call was cancelled");
        return post(endpoint, path, apiKey, requestBody, connectTimeoutMillis, responseTimeoutMillis);
    }

    default byte[] post(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            long connectTimeoutMillis,
            long responseTimeoutMillis,
            OverviewCancellation cancellation,
            long maxResponseBytes) throws IOException {
        return post(endpoint, path, apiKey, requestBody, connectTimeoutMillis, responseTimeoutMillis,
                cancellation);
    }

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

    default void postStream(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            Consumer<String> lineConsumer,
            long connectTimeoutMillis,
            long responseTimeoutMillis) throws IOException {
        postStream(endpoint, path, apiKey, requestBody, lineConsumer);
    }

    default void postStream(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            byte[] requestBody,
            Consumer<String> lineConsumer,
            long connectTimeoutMillis,
            long responseTimeoutMillis,
            AiProviderCallCancellation cancellation) throws IOException {
        if (cancellation != null && cancellation.isCancelled()) throw new IOException("Provider call was cancelled");
        postStream(endpoint, path, apiKey, requestBody, lineConsumer, connectTimeoutMillis, responseTimeoutMillis);
        if (cancellation != null && cancellation.isCancelled()) throw new IOException("Provider call was cancelled");
    }
}
