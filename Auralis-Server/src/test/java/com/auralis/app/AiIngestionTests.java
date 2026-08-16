package com.auralis.app;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.ingestion.TextChunker;
import com.auralis.app.ai.ingestion.CheckedAddressResolver;
import com.auralis.app.ai.ingestion.UrlSecurityPolicy;
import com.auralis.app.ai.ingestion.UrlSourceFetcher;
import com.auralis.app.shared.config.AuralisProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiIngestionTests {

    private HttpServer server;

    @Test
    void chunksTextWithStableOrdinalsOffsetsAndOverlap() {
        List<TextChunk> chunks = new TextChunker(10, 3).chunk("0123456789ABCDEFGHIJ");

        assertThat(chunks).extracting(TextChunk::ordinal).containsExactly(0, 1, 2);
        assertThat(chunks).extracting(TextChunk::content)
                .containsExactly("0123456789", "789ABCDEFG", "EFGHIJ");
        assertThat(chunks.get(1).charStart()).isEqualTo(7);
        assertThat(chunks.get(1).charEnd()).isEqualTo(17);
    }

    @Test
    void rejectsUnsafeUrlsAndAllowsOnlyPublicHttpSchemes() {
        UrlSecurityPolicy policy = new UrlSecurityPolicy();

        assertThatThrownBy(() -> policy.validate(URI.create("http://localhost:8080/private")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> policy.validate(URI.create("file:///private")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(policy.validate(URI.create("https://example.com/docs"))).isEqualTo(URI.create("https://example.com/docs"));
    }

    @Test
    void rejectsInvalidChunkConfigurationAndEmptyText() {
        assertThatThrownBy(() -> new TextChunker(10, 10))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TextChunker(10, 3).chunk("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void keepsSourceHostBoundToTheCheckedAddressSet() throws Exception {
        InetAddress checkedAddress = InetAddress.getByName("93.184.216.34");
        CheckedAddressResolver resolver = CheckedAddressResolver.forHost(
                "Example.com", List.of(checkedAddress));

        assertThat(resolver.resolveHost("example.com")).containsExactly(checkedAddress);
        assertThatThrownBy(() -> resolver.resolveHost("attacker.example"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void revalidatesEachManualRedirectAndConnectsToTheCheckedAddress() throws Exception {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/start", exchange -> {
            exchange.getResponseHeaders().add("Location", "/final");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/final", exchange -> {
            byte[] body = "redirected".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();

        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.urlMaxRedirects()).thenReturn(2);
        when(ai.urlConnectTimeoutMillis()).thenReturn(1000L);
        when(ai.urlReadTimeoutMillis()).thenReturn(1000L);
        when(ai.ingestionMaxBytes()).thenReturn(1024L);
        UrlSecurityPolicy policy = mock(UrlSecurityPolicy.class);
        when(policy.validate(any(URI.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(policy.resolvePublicAddresses(any(URI.class)))
                .thenReturn(List.of(InetAddress.getLoopbackAddress()));

        String result = new UrlSourceFetcher(properties, policy)
                .fetch("http://127.0.0.1:" + server.getAddress().getPort() + "/start");

        assertThat(result).isEqualTo("redirected");
        verify(policy, org.mockito.Mockito.atLeast(2)).validate(any(URI.class));
        verify(policy, org.mockito.Mockito.atLeast(2)).resolvePublicAddresses(any(URI.class));
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }
}
