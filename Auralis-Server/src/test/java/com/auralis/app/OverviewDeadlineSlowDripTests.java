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

        SSLServerSocket server = (SSLServerSocket) serverContext.getServerSocketFactory()
                .createServerSocket(0, 1, InetAddress.getLoopbackAddress());
        CountDownLatch handshakeComplete = new CountDownLatch(1);
        CountDownLatch peerSawClose = new CountDownLatch(1);
        ExecutorService serverExecutor = Executors.newSingleThreadExecutor();
        Future<?> peer = serverExecutor.submit(() -> {
            try (SSLSocket socket = (SSLSocket) server.accept()) {
                socket.startHandshake();
                handshakeComplete.countDown();
                // Deliberately do not consume the request body until the client watchdog closes its socket.
                Thread.sleep(900);
                while (socket.getInputStream().read() != -1) { }
                peerSawClose.countDown();
            } catch (java.io.IOException closedByClient) {
                peerSawClose.countDown();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            return null;
        });
        ExecutorService clientExecutor = Executors.newSingleThreadExecutor();
        ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
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
            OverviewTaskDeadline deadline = new OverviewTaskDeadline(500, System::nanoTime);
            deadline.startWatchdog(watchdog);
            long started = System.nanoTime();
            Future<?> call = clientExecutor.submit(() -> {
                try {
                    client.postJson(endpoint, "/chat/completions", "synthetic", requestBody,
                            JsonNode.class, 2_000, deadline.cancellation());
                    throw new AssertionError("unresponsive TLS peer unexpectedly returned a response");
                } catch (java.io.IOException expected) {
                    return null;
                }
            });
            assertThat(handshakeComplete.await(2, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(150);
            assertThat(call.isDone()).isFalse();
            call.get(2, TimeUnit.SECONDS);
            assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)).isLessThan(1_500L);
            assertThat(peerSawClose.await(2, TimeUnit.SECONDS)).isTrue();
            deadline.finish();
        } finally {
            server.close();
            clientExecutor.shutdownNow();
            serverExecutor.shutdownNow();
            watchdog.shutdownNow();
            assertThat(clientExecutor.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
            assertThat(serverExecutor.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
        }
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
