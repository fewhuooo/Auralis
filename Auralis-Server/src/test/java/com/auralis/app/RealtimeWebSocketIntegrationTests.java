package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.realtime.RealtimeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class RealtimeWebSocketIntegrationTests {

    @LocalServerPort
    private int port;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private RealtimeService realtimeService;

    @Test
    void issuedTicketCompletesWebSocketHandshakeWithoutBearerHeader() throws Exception {
        var owner = AuthTestAccounts.register(identityService, "realtime-websocket@example.com",
                "correct horse battery staple",
                new DeviceCommand("realtime-websocket-device", "Test", DevicePlatform.WEB));
        String ticket = realtimeService.issue(owner.user().id(), owner.serverDeviceId()).ticket();
        OpenListener listener = new OpenListener();

        WebSocket socket = HttpClient.newHttpClient()
                .newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/events?ticket=" + ticket), listener)
                .get(10, TimeUnit.SECONDS);

        listener.opened.get(5, TimeUnit.SECONDS);
        assertThat(socket.isInputClosed()).isFalse();
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "test complete").get(5, TimeUnit.SECONDS);
    }

    private static final class OpenListener implements WebSocket.Listener {
        private final CompletableFuture<Void> opened = new CompletableFuture<>();

        @Override
        public void onOpen(WebSocket webSocket) {
            opened.complete(null);
            webSocket.request(1);
        }
    }
}
