package com.auralis.app.ai.internal.security;

import org.junit.jupiter.api.Test;

import javax.net.ssl.HttpsURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class PinnedSslSocketFactoryTests {

    @Test
    void noArgSocketConnectsToCheckedAddressInsteadOfRequestedDnsTarget() throws Exception {
        InetAddress checkedAddress = InetAddress.getLoopbackAddress();
        try (ServerSocket server = new ServerSocket(0, 1, checkedAddress)) {
            CompletableFuture<Void> accepted = CompletableFuture.runAsync(() -> {
                try (Socket ignored = server.accept()) {
                    // Connection acceptance is the assertion boundary.
                } catch (Exception exception) {
                    throw new RuntimeException(exception);
                }
            });
            PinnedSslSocketFactory factory = new PinnedSslSocketFactory(
                    HttpsURLConnection.getDefaultSSLSocketFactory(),
                    List.of(checkedAddress),
                    server.getLocalPort(),
                    1_000);

            try (Socket socket = factory.createSocket()) {
                socket.connect(InetSocketAddress.createUnresolved(
                        "unresolved-provider.test", server.getLocalPort()), 1_000);

                assertThat(socket.isConnected()).isTrue();
                assertThat(socket.getInetAddress()).isEqualTo(checkedAddress);
            }
            accepted.get(1, TimeUnit.SECONDS);
        }
    }
}
