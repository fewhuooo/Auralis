package com.auralis.app.realtime;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

public class RealtimeWebSocketHandshakeInterceptor implements HandshakeInterceptor {
    static final String SUBSCRIPTION_ATTRIBUTE = RealtimeWebSocketHandshakeInterceptor.class.getName() + ".subscription";

    private final RealtimeService realtimeService;

    public RealtimeWebSocketHandshakeInterceptor(RealtimeService realtimeService) {
        this.realtimeService = realtimeService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String ticket = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("ticket");
        if (ticket == null || ticket.isBlank()) {
            ticket = request.getHeaders().getFirst("X-Realtime-Ticket");
        }
        try {
            attributes.put(SUBSCRIPTION_ATTRIBUTE, realtimeService.consume(ticket));
            return true;
        } catch (RuntimeException exception) {
            response.setStatusCode(org.springframework.http.HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // No state is created until the handler confirms the websocket connection.
    }
}
