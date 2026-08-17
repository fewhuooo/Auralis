package com.auralis.app.ai.internal.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.function.Consumer;

@Component
public class ProviderHttpClient {

    private final ObjectMapper objectMapper;
    private final ProviderHttpTransport transport;
    private final long maxResponseBytes;

    @Autowired
    public ProviderHttpClient(ObjectMapper objectMapper, AuralisProperties properties) {
        this(objectMapper,
                new HttpsUrlConnectionTransport(
                        properties.ai().requestTimeoutMillis(), properties.ai().providerMaxResponseBytes()),
                properties.ai().providerMaxResponseBytes());
    }

    public ProviderHttpClient(ObjectMapper objectMapper, ProviderHttpTransport transport, long maxResponseBytes) {
        this.objectMapper = objectMapper;
        this.transport = transport;
        this.maxResponseBytes = maxResponseBytes;
    }

    public <T> T postJson(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            Object body,
            Class<T> responseType) throws IOException {
        if (endpoint == null || path == null || !path.startsWith("/")
                || apiKey == null || apiKey.isBlank() || responseType == null) {
            throw new IllegalArgumentException("Provider request is invalid");
        }
        byte[] requestBody;
        try {
            requestBody = objectMapper.writeValueAsBytes(body);
        } catch (JsonProcessingException exception) {
            throw new IOException("Could not serialize provider request", exception);
        }
        byte[] responseBody = transport.post(endpoint, path, apiKey, requestBody);
        if (responseBody == null || responseBody.length > maxResponseBytes) {
            throw new ProviderResponseTooLargeException();
        }
        try {
            return objectMapper.readValue(responseBody, responseType);
        } catch (JsonProcessingException exception) {
            throw new IOException("Could not parse provider response", exception);
        }
    }

    public void postStream(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            Object body,
            Consumer<String> lineConsumer) throws IOException {
        if (endpoint == null || path == null || !path.startsWith("/")
                || apiKey == null || apiKey.isBlank() || lineConsumer == null) {
            throw new IllegalArgumentException("Provider streaming request is invalid");
        }
        byte[] requestBody;
        try {
            requestBody = objectMapper.writeValueAsBytes(body);
        } catch (JsonProcessingException exception) {
            throw new IOException("Could not serialize provider request", exception);
        }
        transport.postStream(endpoint, path, apiKey, requestBody, lineConsumer);
    }

    private static final class HttpsUrlConnectionTransport implements ProviderHttpTransport {

        private final int timeoutMillis;
        private final long maxResponseBytes;
        private final SSLSocketFactory defaultSocketFactory;

        private HttpsUrlConnectionTransport(long timeoutMillis, long maxResponseBytes) {
            this.timeoutMillis = Math.toIntExact(Math.min(Integer.MAX_VALUE, Math.max(1, timeoutMillis)));
            this.maxResponseBytes = maxResponseBytes;
            this.defaultSocketFactory = defaultSocketFactory();
        }

        @Override
        public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody)
                throws IOException {
            URI target = buildTargetUri(endpoint, path);
            HttpsURLConnection connection = (HttpsURLConnection) target.toURL().openConnection();
            connection.setConnectTimeout(timeoutMillis);
            connection.setReadTimeout(timeoutMillis);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setFixedLengthStreamingMode(requestBody.length);
            connection.setSSLSocketFactory(new PinnedSslSocketFactory(
                    defaultSocketFactory, endpoint.addresses(), endpoint.port(), timeoutMillis));
            connection.setHostnameVerifier(HttpsURLConnection.getDefaultHostnameVerifier());
            try {
                connection.getOutputStream().write(requestBody);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new ProviderHttpException(status);
                }
                try (InputStream input = connection.getInputStream()) {
                    return readBounded(input, maxResponseBytes);
                }
            } finally {
                connection.disconnect();
            }
        }

        @Override
        public void postStream(
                ResolvedProviderEndpoint endpoint,
                String path,
                String apiKey,
                byte[] requestBody,
                java.util.function.Consumer<String> lineConsumer) throws IOException {
            URI target = buildTargetUri(endpoint, path);
            HttpsURLConnection connection = (HttpsURLConnection) target.toURL().openConnection();
            connection.setConnectTimeout(timeoutMillis);
            connection.setReadTimeout(timeoutMillis);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "text/event-stream");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setFixedLengthStreamingMode(requestBody.length);
            connection.setSSLSocketFactory(new PinnedSslSocketFactory(
                    defaultSocketFactory, endpoint.addresses(), endpoint.port(), timeoutMillis));
            connection.setHostnameVerifier(HttpsURLConnection.getDefaultHostnameVerifier());
            try {
                connection.getOutputStream().write(requestBody);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new ProviderHttpException(status);
                }
                try (InputStream input = connection.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                    long total = 0;
                    String line;
                    while ((line = reader.readLine()) != null) {
                        total += line.getBytes(StandardCharsets.UTF_8).length + 1L;
                        if (total > maxResponseBytes) {
                            throw new ProviderResponseTooLargeException();
                        }
                        lineConsumer.accept(line);
                    }
                }
            } finally {
                connection.disconnect();
            }
        }

        private URI buildTargetUri(ResolvedProviderEndpoint endpoint, String path) {
            String basePath = endpoint.basePath();
            String normalizedBase = basePath == null || basePath.isBlank() ? "/" : basePath;
            if (!normalizedBase.startsWith("/")) {
                normalizedBase = "/" + normalizedBase;
            }
            if (normalizedBase.endsWith("/") && path.startsWith("/")) {
                normalizedBase = normalizedBase.substring(0, normalizedBase.length() - 1);
            }
            String combinedPath = normalizedBase + path;
            String host = endpoint.host().contains(":") ? "[" + endpoint.host() + "]" : endpoint.host();
            return URI.create("https://" + host + ":" + endpoint.port() + combinedPath);
        }

        private byte[] readBounded(InputStream input, long maxBytes) throws IOException {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) {
                    throw new ProviderResponseTooLargeException();
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }

        private SSLSocketFactory defaultSocketFactory() {
            try {
                SSLContext context = SSLContext.getInstance("TLS");
                context.init(null, null, null);
                return context.getSocketFactory();
            } catch (GeneralSecurityException exception) {
                throw new IllegalStateException("Could not initialize TLS", exception);
            }
        }
    }

}
