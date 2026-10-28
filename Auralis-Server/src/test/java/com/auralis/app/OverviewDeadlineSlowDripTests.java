package com.auralis.app;

import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.OverviewTaskDeadline;
import com.auralis.app.shared.config.AuralisProperties;
import org.mockito.Mockito;
import static org.mockito.Mockito.when;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewDeadlineSlowDripTests {

    @Test
    void watchdogClosesSocketWhenTlsRequestBodyWriteIsBlocked() throws Exception {
        Path keystorePath = Path.of(System.getProperty("auralis.test.tls.keystore"));
        char[] password = "changeit".toCharArray();
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(keystorePath)) {
            keyStore.load(input, password);
        }
        KeyManagerFactory keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagers.init(keyStore, password);
        SSLContext serverContext = SSLContext.getInstance("TLS");
        serverContext.init(keyManagers.getKeyManagers(), null, null);
        System.setProperty("javax.net.ssl.trustStore", keystorePath.toString());
        System.setProperty("javax.net.ssl.trustStoreType", "PKCS12");
        System.setProperty("javax.net.ssl.trustStorePassword", "changeit");

        SSLServerSocket server = (SSLServerSocket) serverContext.getServerSocketFactory().createServerSocket();
        server.setReceiveBufferSize(1024);
        server.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 1);
        CountDownLatch headersRead = new CountDownLatch(1);
        CountDownLatch releaseBodyRead = new CountDownLatch(1);
        CountDownLatch peerFinished = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicLong bodyBytesRead = new java.util.concurrent.atomic.AtomicLong();
        java.util.concurrent.atomic.AtomicLong contentLength = new java.util.concurrent.atomic.AtomicLong(-1);
        ExecutorService serverExecutor = Executors.newSingleThreadExecutor();
        ExecutorService clientExecutor = Executors.newSingleThreadExecutor();
        ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
        java.util.concurrent.atomic.AtomicLong monotonicNanos = new java.util.concurrent.atomic.AtomicLong();
        OverviewTaskDeadline deadline = new OverviewTaskDeadline(500, monotonicNanos::get);
        Future<?> peer = serverExecutor.submit(() -> {
            try (SSLSocket socket = (SSLSocket) server.accept()) {
                socket.setReceiveBufferSize(1024);
                socket.startHandshake();
                String headers = readRequestHeaders(socket.getInputStream());
                java.util.regex.Matcher length = java.util.regex.Pattern.compile("(?im)^Content-Length:\\s*(\\d+)\\s*$").matcher(headers);
                if (length.find()) contentLength.set(Long.parseLong(length.group(1)));
                headersRead.countDown();
                // Pause after headers so the large TLS body remains in flight until the watchdog closes the socket.
                if (!releaseBodyRead.await(5, TimeUnit.SECONDS)) throw new AssertionError("test did not release paused peer");
                try {
                    while (socket.getInputStream().read() != -1) bodyBytesRead.incrementAndGet();
                } catch (java.io.IOException closedByDeadline) {
                    // The watchdog closes the connection while the request body is in flight.
                }
            } catch (java.io.IOException closedByClient) {
                // The watchdog may close the socket before the peer resumes reading.
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                peerFinished.countDown();
            }
            return null;
        });
        Future<?> call = null;
        try {
            ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint("localhost",
                    server.getLocalPort(), List.of(InetAddress.getLoopbackAddress()), "/v1");
            AuralisProperties properties = Mockito.mock(AuralisProperties.class);
            AuralisProperties.Ai ai = Mockito.mock(AuralisProperties.Ai.class);
            when(properties.ai()).thenReturn(ai);
            when(ai.providerConnectTimeoutMillis()).thenReturn(2_000L);
            when(ai.requestTimeoutMillis()).thenReturn(2_000L);
            when(ai.providerMaxResponseBytes()).thenReturn(1024L);
            ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), properties);
            // Larger than loopback/TLS buffers so the writer blocks while the server refuses to read.
            Map<String, String> requestBody = Map.of("payload", "x".repeat(32 * 1024 * 1024));
            call = clientExecutor.submit(() -> {
                try {
                    client.postJson(endpoint, "/chat/completions", "synthetic", requestBody,
                            JsonNode.class, 2_000, deadline.cancellation());
                    throw new AssertionError("unresponsive TLS peer unexpectedly returned a response");
                } catch (java.io.IOException expected) {
                    return null;
                }
            });
            assertThat(headersRead.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(contentLength.get()).isGreaterThan(32L * 1024 * 1024);
            Thread.sleep(100);
            assertThat(call.isDone()).isFalse();
            // Keep the injected clock frozen through TLS/bootstrap. Start the real 500ms scheduled
            // watchdog only after the peer has stopped consuming the request body.
            deadline.startWatchdog(watchdog);
            call.get(2, TimeUnit.SECONDS);
            assertThat(deadline.cancellation().reason()).isEqualTo(OverviewCancellation.Reason.DEADLINE);
            releaseBodyRead.countDown();
            assertThat(peerFinished.await(3, TimeUnit.SECONDS)).isTrue();
            peer.get(1, TimeUnit.SECONDS);
            assertThat(bodyBytesRead.get()).isLessThan(contentLength.get());
        } finally {
            deadline.cancellation().cancel(OverviewCancellation.Reason.DEADLINE);
            releaseBodyRead.countDown();
            deadline.finish();
            server.close();
            if (call != null) call.cancel(true);
            clientExecutor.shutdownNow();
            serverExecutor.shutdownNow();
            watchdog.shutdownNow();
            assertThat(clientExecutor.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
            assertThat(serverExecutor.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
        }
    }

    private static String readRequestHeaders(InputStream input) throws java.io.IOException {
        java.io.ByteArrayOutputStream headers = new java.io.ByteArrayOutputStream();
        int matched = 0;
        while (matched < 4) {
            int value = input.read();
            if (value == -1) throw new java.io.IOException("connection closed before request headers completed");
            headers.write(value);
            matched = switch (matched) {
                case 0 -> value == '\r' ? 1 : 0;
                case 1 -> value == '\n' ? 2 : value == '\r' ? 1 : 0;
                case 2 -> value == '\r' ? 3 : 0;
                default -> value == '\n' ? 4 : 0;
            };
        }
        return headers.toString(java.nio.charset.StandardCharsets.ISO_8859_1);
    }

    @Test
    void watchdogAbortsTlsSlowDripAtOverviewAbsoluteDeadline() throws Exception {
        Path keystorePath = Path.of(System.getProperty("auralis.test.tls.keystore"));
        char[] password = "changeit".toCharArray();
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(keystorePath)) {
            keyStore.load(input, password);
        }
        KeyManagerFactory keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagers.init(keyStore, password);
        SSLContext serverContext = SSLContext.getInstance("TLS");
        serverContext.init(keyManagers.getKeyManagers(), null, null);
        System.setProperty("javax.net.ssl.trustStore", keystorePath.toString());
        System.setProperty("javax.net.ssl.trustStoreType", "PKCS12");
        System.setProperty("javax.net.ssl.trustStorePassword", "changeit");

        HttpsServer server = HttpsServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        var serverExecutor = Executors.newSingleThreadExecutor();
        server.setHttpsConfigurator(new HttpsConfigurator(serverContext));
        server.setExecutor(serverExecutor);
        server.createContext("/v1/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] body = "{\"ok\":true}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                for (byte value : body) {
                    output.write(value);
                    output.flush();
                    try { Thread.sleep(60); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new java.io.IOException("test interrupted", interrupted); }
                }
            } catch (java.io.IOException disconnected) { /* Client deadline closed its local TLS socket. */ }
        });
        server.start();
        try {
            ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint("localhost",
                    server.getAddress().getPort(), List.of(InetAddress.getLoopbackAddress()), "/v1");
            AuralisProperties properties = Mockito.mock(AuralisProperties.class);
            AuralisProperties.Ai ai = Mockito.mock(AuralisProperties.Ai.class);
            when(properties.ai()).thenReturn(ai);
            when(ai.providerConnectTimeoutMillis()).thenReturn(1_000L);
            when(ai.requestTimeoutMillis()).thenReturn(1_000L);
            when(ai.providerMaxResponseBytes()).thenReturn(1024L);
            ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), properties);
            ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
            try {
                OverviewTaskDeadline deadline = new OverviewTaskDeadline(250, System::nanoTime);
                deadline.startWatchdog(watchdog);
                long started = System.nanoTime();
                assertThatThrownBy(() -> client.postJson(endpoint, "/chat/completions", "synthetic", Map.of(),
                        JsonNode.class, 1_000, deadline.cancellation())).isInstanceOf(java.io.IOException.class);
                long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
                assertThat(elapsedMillis).isLessThan(700L);
                deadline.finish();
            } finally {
                watchdog.shutdownNow();
            }
        } finally {
            server.stop(0);
            serverExecutor.shutdownNow();
        }
    }

    @Test
    void cancellationClosesRawSocketWhileTlsHandshakeIsBlocked() throws Exception {
        InetAddress loopback = InetAddress.getLoopbackAddress();
        ServerSocket server = new ServerSocket(0, 1, loopback);
        CountDownLatch accepted = new CountDownLatch(1);
        CountDownLatch peerSawEof = new CountDownLatch(1);
        var serverExecutor = Executors.newSingleThreadExecutor();
        serverExecutor.submit(() -> {
            try (Socket socket = server.accept()) {
                accepted.countDown();
                socket.getInputStream().readNBytes(5);
                while (socket.getInputStream().read() != -1) { }
                peerSawEof.countDown();
            } catch (java.io.IOException ignored) {
                peerSawEof.countDown();
            }
        });
        try {
            ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint("localhost",
                    server.getLocalPort(), List.of(loopback), "/v1");
            AuralisProperties properties = Mockito.mock(AuralisProperties.class);
            AuralisProperties.Ai ai = Mockito.mock(AuralisProperties.Ai.class);
            when(properties.ai()).thenReturn(ai);
            when(ai.providerConnectTimeoutMillis()).thenReturn(2_000L);
            when(ai.requestTimeoutMillis()).thenReturn(2_000L);
            when(ai.providerMaxResponseBytes()).thenReturn(1024L);
            ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), properties);
            ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
            try {
                OverviewTaskDeadline deadline = new OverviewTaskDeadline(250, System::nanoTime);
                deadline.startWatchdog(watchdog);
                long started = System.nanoTime();
                assertThatThrownBy(() -> client.postJson(endpoint, "/chat/completions", "synthetic", Map.of(),
                        JsonNode.class, 2_000, deadline.cancellation())).isInstanceOf(java.io.IOException.class);
                long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
                assertThat(accepted.await(1, TimeUnit.SECONDS)).isTrue();
                assertThat(peerSawEof.await(1, TimeUnit.SECONDS)).isTrue();
                assertThat(elapsedMillis).isLessThan(800L);
                deadline.finish();
            } finally {
                watchdog.shutdownNow();
            }
        } finally {
            server.close();
            serverExecutor.shutdownNow();
        }
    }
}
