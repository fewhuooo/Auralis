package com.auralis.server.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.server.common.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 14.5 Sync WebSocket Handler
 * Manages WebSocket connections for real-time synchronization.
 * Includes JWT validation keep-alive and scheduled expiration audit.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SyncWebSocketHandler extends TextWebSocketHandler {

    private final CopyOnWriteArrayList<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final JwtUtil jwtUtil;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
        log.info("[WebSocket] New WebSocket connection established: {}", session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessions.remove(session);
        log.info("[WebSocket] WebSocket connection closed: {}, status: {}", session.getId(), status);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.debug("[WebSocket] Received text message: {}", payload);

        if (payload.startsWith("{")) {
            try {
                JsonNode jsonNode = objectMapper.readTree(payload);
                if (jsonNode.has("type") && "PING".equals(jsonNode.get("type").asText())) {
                    String token = jsonNode.has("token") ? jsonNode.get("token").asText() : null;
                    if (token != null && jwtUtil.validateToken(token)) {
                        String username = jwtUtil.extractUsername(token);
                        // Update stored token and username inside session attributes
                        session.getAttributes().put("token", token);
                        session.getAttributes().put("username", username);
                        
                        // Send PONG response
                        synchronized (session) {
                            if (session.isOpen()) {
                                session.sendMessage(new TextMessage("{\"type\":\"PONG\",\"timestamp\":" + System.currentTimeMillis() + "}"));
                            }
                        }
                        log.debug("[WebSocket] Handled Ping and replied Pong for user: {}", username);
                        return;
                    } else {
                        log.warn("[WebSocket] Closing connection {} due to invalid/expired token in heartbeat Ping.", session.getId());
                        session.close(new CloseStatus(1008, "Policy Violation"));
                        return;
                    }
                }
            } catch (Exception e) {
                log.warn("[WebSocket] Failed to parse text message as JSON: {}", payload, e);
            }
        }
    }

    /**
     * Broadcasts a sync event to all connected sessions.
     * Includes thread-safety locks on a per-session basis to prevent concurrent write exceptions.
     */
    public void broadcast(String message) {
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    synchronized (session) {
                        if (session.isOpen()) {
                            session.sendMessage(new TextMessage(message));
                        }
                    }
                } catch (Exception e) {
                    log.error("[WebSocket] Error sending message to session {}", session.getId(), e);
                }
            }
        }
    }

    /**
     * 14.5 Session Expiration Auditor
     * Runs every 60 seconds to inspect active connections and close any that have expired/invalid tokens.
     */
    @Scheduled(fixedRate = 60000)
    public void auditSessions() {
        log.debug("[WebSocket] Running periodic session security audit (Active sessions: {})", sessions.size());
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                String token = (String) session.getAttributes().get("token");
                if (token == null || !jwtUtil.validateToken(token)) {
                    log.warn("[WebSocket] Closing session {} during audit: Token has expired or is missing.", session.getId());
                    try {
                        session.close(new CloseStatus(1008, "Policy Violation"));
                    } catch (IOException e) {
                        log.error("[WebSocket] Error closing expired session {}", session.getId(), e);
                    }
                }
            }
        }
    }
}
