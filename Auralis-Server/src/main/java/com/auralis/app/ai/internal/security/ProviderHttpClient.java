package com.auralis.app.ai.internal.security;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.shared.config.AuralisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.concurrent.atomic.AtomicLong;

@Component
public class ProviderHttpClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(ProviderHttpClient.class);

    private final ObjectMapper objectMapper;
    private final ProviderHttpTransport transport;
    private final long maxResponseBytes;
    private final long connectTimeoutMillis;
    private final long responseTimeoutMillis;

    @Autowired
    public ProviderHttpClient(ObjectMapper objectMapper, AuralisProperties properties) {
        this(objectMapper,
                new HttpsUrlConnectionTransport(
                        properties.ai().providerConnectTimeoutMillis(),
                        properties.ai().requestTimeoutMillis(), properties.ai().providerMaxResponseBytes()),
                properties.ai().providerMaxResponseBytes(),
                properties.ai().providerConnectTimeoutMillis(),
                properties.ai().requestTimeoutMillis());
    }

    public ProviderHttpClient(ObjectMapper objectMapper, ProviderHttpTransport transport, long maxResponseBytes) {
        this(objectMapper, transport, maxResponseBytes, 3_000, 10_000);
    }

    public ProviderHttpClient(
            ObjectMapper objectMapper,
            ProviderHttpTransport transport,
            long maxResponseBytes,
            long connectTimeoutMillis,
            long responseTimeoutMillis) {
        this.objectMapper = objectMapper;
        this.transport = transport;
        this.maxResponseBytes = maxResponseBytes;
        this.connectTimeoutMillis = requirePositiveTimeout(connectTimeoutMillis);
        this.responseTimeoutMillis = requirePositiveTimeout(responseTimeoutMillis);
    }

    public <T> T postJson(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            Object body,
            Class<T> responseType) throws IOException {
        return postJson(endpoint, path, apiKey, body, responseType, responseTimeoutMillis);
    }

    public <T> T postJson(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            Object body,
            Class<T> responseType,
            long responseTimeoutMillis,
            OverviewCancellation cancellation) throws IOException {
        if (endpoint == null || path == null || !path.startsWith("/")
                || apiKey == null || apiKey.isBlank() || responseType == null) {
            throw new IllegalArgumentException("Provider request is invalid");
        }
        byte[] requestBody;
        try {
            requestBody = objectMapper.writeValueAsBytes(body);
        } catch (JacksonException exception) {
            throw new IOException("Could not serialize provider request", exception);
        }
        if (cancellation != null && cancellation.isCancelled()) throw new IOException("Provider call was cancelled");
        logStructuredJsonMode(requestBody);
        byte[] responseBody = transport.post(endpoint, path, apiKey, requestBody, connectTimeoutMillis,
                requirePositiveTimeout(responseTimeoutMillis), cancellation);
        if (responseBody == null || responseBody.length > maxResponseBytes) throw new ProviderResponseTooLargeException();
        try {
            return objectMapper.readValue(responseBody, responseType);
        } catch (JacksonException exception) {
            throw new IOException("Could not parse provider response", exception);
        }
    }

    public <T> T getJson(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            Class<T> responseType) throws IOException {
        if (endpoint == null || path == null || !path.startsWith("/")
                || apiKey == null || apiKey.isBlank() || responseType == null) {
            throw new IllegalArgumentException("Provider request is invalid");
        }
        long startedAt = System.nanoTime();
        LOGGER.info("AI_PROVIDER_HTTP_START kind=json method=GET host={} port={} path={} resolvedAddressCount={}",
                endpoint.host(), endpoint.port(), path, endpoint.addresses().size());
        try {
            byte[] responseBody = transport.get(endpoint, path, apiKey, connectTimeoutMillis, responseTimeoutMillis);
            if (responseBody == null || responseBody.length > maxResponseBytes) {
                throw new ProviderResponseTooLargeException();
            }
            try {
                T response = objectMapper.readValue(responseBody, responseType);
                LOGGER.info("AI_PROVIDER_HTTP_SUCCESS kind=json method=GET host={} port={} path={} status=2xx responseBytes={} elapsedMs={}",
                        endpoint.host(), endpoint.port(), path, responseBody.length, elapsedMillis(startedAt));
                return response;
            } catch (JacksonException exception) {
                throw new IOException("Could not parse provider response", exception);
            }
        } catch (ProviderHttpException exception) {
            LOGGER.warn("AI_PROVIDER_HTTP_FAILED kind=json method=GET host={} port={} path={} status={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.status(), elapsedMillis(startedAt));
            throw exception;
        } catch (ProviderResponseTooLargeException exception) {
            LOGGER.warn("AI_PROVIDER_HTTP_FAILED kind=json method=GET host={} port={} path={} error=response_too_large elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, elapsedMillis(startedAt));
            throw exception;
        } catch (IOException exception) {
            LOGGER.warn("AI_PROVIDER_HTTP_FAILED kind=json method=GET host={} port={} path={} errorType={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.getClass().getSimpleName(), elapsedMillis(startedAt));
            throw exception;
        }
    }

    public <T> T postJson(
            ResolvedProviderEndpoint endpoint,
            String path,
            String apiKey,
            Object body,
            Class<T> responseType,
            long responseTimeoutMillis) throws IOException {
        if (endpoint == null || path == null || !path.startsWith("/")
                || apiKey == null || apiKey.isBlank() || responseType == null) {
            throw new IllegalArgumentException("Provider request is invalid");
        }
        byte[] requestBody;
        try {
            requestBody = objectMapper.writeValueAsBytes(body);
        } catch (JacksonException exception) {
            throw new IOException("Could not serialize provider request", exception);
        }
        logStructuredJsonMode(requestBody);
        long startedAt = System.nanoTime();
        LOGGER.info(
                "AI_PROVIDER_HTTP_START kind=json host={} port={} path={} resolvedAddressCount={} requestBytes={} responseType={}",
                endpoint.host(), endpoint.port(), path, endpoint.addresses().size(), requestBody.length,
                responseType.getSimpleName());
        try {
            byte[] responseBody = transport.post(endpoint, path, apiKey, requestBody,
                    connectTimeoutMillis, requirePositiveTimeout(responseTimeoutMillis));
            if (responseBody == null || responseBody.length > maxResponseBytes) {
                throw new ProviderResponseTooLargeException();
            }
            try {
                T response = objectMapper.readValue(responseBody, responseType);
                LOGGER.info(
                        "AI_PROVIDER_HTTP_SUCCESS kind=json host={} port={} path={} status=2xx responseBytes={} elapsedMs={}",
                        endpoint.host(), endpoint.port(), path, responseBody.length, elapsedMillis(startedAt));
                return response;
            } catch (JacksonException exception) {
                throw new IOException("Could not parse provider response", exception);
            }
        } catch (ProviderHttpException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_HTTP_FAILED kind=json host={} port={} path={} status={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.status(), elapsedMillis(startedAt));
            throw exception;
        } catch (ProviderResponseTooLargeException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_HTTP_FAILED kind=json host={} port={} path={} error=response_too_large elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, elapsedMillis(startedAt));
            throw exception;
        } catch (IOException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_HTTP_FAILED kind=json host={} port={} path={} errorType={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.getClass().getSimpleName(),
                    elapsedMillis(startedAt));
            throw exception;
        }
    }

    private void logStructuredJsonMode(byte[] requestBody) {
        try {
            JsonNode body = objectMapper.readTree(requestBody);
            JsonNode responseFormat = body == null ? null : body.path("response_format");
            JsonNode type = responseFormat == null ? null : responseFormat.path("type");
            JsonNode maxTokens = body == null ? null : body.path("max_tokens");
            if (type == null || !type.isTextual() || !"json_object".equals(type.asText())
                    || maxTokens == null || !maxTokens.isNumber()) {
                return;
            }
            int tokenBudget = maxTokens.asInt(-1);
            String stage = switch (tokenBudget) {
                case 4_608 -> "INTERMEDIATE";
                case 6_144 -> "FINAL";
                default -> null;
            };
            if (stage != null) {
                LOGGER.info("AI_JSON_MODE structuredJson=true responseFormat=json_object maxTokens={} stage={}",
                        tokenBudget, stage);
            }
        } catch (JacksonException ignored) {
            // The body was already serialized successfully; diagnostics must not alter provider behavior.
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
        } catch (JacksonException exception) {
            throw new IOException("Could not serialize provider request", exception);
        }
        long startedAt = System.nanoTime();
        AtomicLong lineCount = new AtomicLong();
        AtomicLong responseBytes = new AtomicLong();
        LOGGER.info(
                "AI_PROVIDER_HTTP_START kind=stream host={} port={} path={} resolvedAddressCount={} requestBytes={}",
                endpoint.host(), endpoint.port(), path, endpoint.addresses().size(), requestBody.length);
        try {
            transport.postStream(endpoint, path, apiKey, requestBody, line -> {
                lineCount.incrementAndGet();
                responseBytes.addAndGet(line == null ? 0 : line.getBytes(StandardCharsets.UTF_8).length + 1L);
                lineConsumer.accept(line);
            }, connectTimeoutMillis, responseTimeoutMillis);
            LOGGER.info(
                    "AI_PROVIDER_HTTP_SUCCESS kind=stream host={} port={} path={} status=2xx lineCount={} responseBytes={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, lineCount.get(), responseBytes.get(),
                    elapsedMillis(startedAt));
        } catch (ProviderHttpException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_HTTP_FAILED kind=stream host={} port={} path={} status={} lineCount={} responseBytes={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.status(), lineCount.get(), responseBytes.get(),
                    elapsedMillis(startedAt));
            throw exception;
        } catch (IOException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_HTTP_FAILED kind=stream host={} port={} path={} errorType={} lineCount={} responseBytes={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.getClass().getSimpleName(), lineCount.get(),
                    responseBytes.get(), elapsedMillis(startedAt));
            throw exception;
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "AI_PROVIDER_HTTP_FAILED kind=stream host={} port={} path={} errorType={} lineCount={} responseBytes={} elapsedMs={}",
                    endpoint.host(), endpoint.port(), path, exception.getClass().getSimpleName(), lineCount.get(),
                    responseBytes.get(), elapsedMillis(startedAt));
            throw exception;
        }
    }

    private static final class HttpsUrlConnectionTransport implements ProviderHttpTransport {

        private final int connectTimeoutMillis;
        private final int responseTimeoutMillis;
        private final long maxResponseBytes;
        private final SSLSocketFactory defaultSocketFactory;

        private HttpsUrlConnectionTransport(long connectTimeoutMillis, long responseTimeoutMillis,
                                            long maxResponseBytes) {
            this.connectTimeoutMillis = toIntTimeout(connectTimeoutMillis);
            this.responseTimeoutMillis = toIntTimeout(responseTimeoutMillis);
            this.maxResponseBytes = maxResponseBytes;
            this.defaultSocketFactory = defaultSocketFactory();
        }

        @Override
        public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody)
                throws IOException {
            return post(endpoint, path, apiKey, requestBody, connectTimeoutMillis, responseTimeoutMillis);
        }

        @Override
        public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody,
                           long connectTimeoutMillis, long responseTimeoutMillis) throws IOException {
            return post(endpoint, path, apiKey, requestBody, connectTimeoutMillis, responseTimeoutMillis, null);
        }

        @Override
        public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody,
                           long connectTimeoutMillis, long responseTimeoutMillis,
                           OverviewCancellation cancellation) throws IOException {
            URI target = buildTargetUri(endpoint, path);
            HttpsURLConnection connection = (HttpsURLConnection) target.toURL().openConnection();
            ProviderSocketRegistry registry = new ProviderSocketRegistry();
            OverviewCancellation.Registration cancellationRegistration = cancellation == null
                    ? () -> { } : cancellation.onCancel(registry::abort);
            int connectTimeout = toIntTimeout(connectTimeoutMillis);
            int responseTimeout = toIntTimeout(responseTimeoutMillis);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(responseTimeout);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setRequestProperty("Connection", "close");
            connection.setFixedLengthStreamingMode(requestBody.length);
            connection.setSSLSocketFactory(new PinnedSslSocketFactory(
                    defaultSocketFactory, endpoint.addresses(), endpoint.port(), connectTimeout, registry));
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
                cancellationRegistration.close();
                registry.clear();
                connection.disconnect();
            }
        }

        @Override
        public byte[] get(ResolvedProviderEndpoint endpoint, String path, String apiKey,
                          long connectTimeoutMillis, long responseTimeoutMillis) throws IOException {
            URI target = buildTargetUri(endpoint, path);
            HttpsURLConnection connection = (HttpsURLConnection) target.toURL().openConnection();
            int connectTimeout = toIntTimeout(connectTimeoutMillis);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(toIntTimeout(responseTimeoutMillis));
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setSSLSocketFactory(new PinnedSslSocketFactory(
                    defaultSocketFactory, endpoint.addresses(), endpoint.port(), connectTimeout));
            connection.setHostnameVerifier(HttpsURLConnection.getDefaultHostnameVerifier());
            try {
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
            postStream(endpoint, path, apiKey, requestBody, lineConsumer,
                    connectTimeoutMillis, responseTimeoutMillis);
        }

        @Override
        public void postStream(
                ResolvedProviderEndpoint endpoint,
                String path,
                String apiKey,
                byte[] requestBody,
                java.util.function.Consumer<String> lineConsumer,
                long connectTimeoutMillis,
                long responseTimeoutMillis) throws IOException {
            URI target = buildTargetUri(endpoint, path);
            HttpsURLConnection connection = (HttpsURLConnection) target.toURL().openConnection();
            int connectTimeout = toIntTimeout(connectTimeoutMillis);
            int responseTimeout = toIntTimeout(responseTimeoutMillis);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(responseTimeout);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "text/event-stream");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setFixedLengthStreamingMode(requestBody.length);
            connection.setSSLSocketFactory(new PinnedSslSocketFactory(
                    defaultSocketFactory, endpoint.addresses(), endpoint.port(), connectTimeout));
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

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }

    private static long requirePositiveTimeout(long timeoutMillis) {
        if (timeoutMillis <= 0) {
            throw new IllegalArgumentException("Provider timeout must be positive");
        }
        return timeoutMillis;
    }

    private static int toIntTimeout(long timeoutMillis) {
        return Math.toIntExact(Math.min(Integer.MAX_VALUE, requirePositiveTimeout(timeoutMillis)));
    }

}
