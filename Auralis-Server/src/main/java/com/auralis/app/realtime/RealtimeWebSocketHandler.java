package com.auralis.app.realtime;

import tools.jackson.databind.ObjectMapper;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;

public class RealtimeWebSocketHandler implements WebSocketHandler {
    private final RealtimeEventPublisher publisher;
    private final ObjectMapper objectMapper;

    public RealtimeWebSocketHandler(RealtimeEventPublisher publisher, ObjectMapper objectMapper) {
        this.publisher = publisher;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        RealtimeSubscription subscription = subscription(session);
        AutoCloseable closeHandle = publisher.subscribe(subscription.userId(), event -> send(session, event));
        session.getAttributes().put(RealtimeWebSocketHandler.class.getName() + ".close", closeHandle);
    }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) {
        // Realtime is a notification channel; clients fetch business data through REST.
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        closeSubscription(session);
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) {
        closeSubscription(session);
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }

    private RealtimeSubscription subscription(WebSocketSession session) {
        Object value = session.getAttributes().get(RealtimeWebSocketHandshakeInterceptor.SUBSCRIPTION_ATTRIBUTE);
        if (value instanceof RealtimeSubscription result) {
            return result;
        }
        throw new IllegalStateException("Missing realtime subscription");
    }

    private void send(WebSocketSession session, RealtimeEventView event) {
        if (!session.isOpen()) {
            return;
        }
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(event)));
            }
        } catch (IOException exception) {
            try {
                session.close(CloseStatus.SERVER_ERROR);
            } catch (IOException ignored) {
                // The transport is already unavailable.
            }
        }
    }

    private void closeSubscription(WebSocketSession session) {
        Object value = session.getAttributes().remove(RealtimeWebSocketHandler.class.getName() + ".close");
        if (value instanceof AutoCloseable closeHandle) {
            try {
                closeHandle.close();
            } catch (Exception ignored) {
                // Cleanup must not mask the websocket close.
            }
        }
    }
}
