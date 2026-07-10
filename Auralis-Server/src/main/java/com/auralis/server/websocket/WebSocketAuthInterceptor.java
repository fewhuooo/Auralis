package com.auralis.server.websocket;

import com.auralis.server.common.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 14.5 WebSocket Handshake Authentication Interceptor
 * Extracts the JWT token from the upgrade query parameter "token" and validates it.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements HandshakeInterceptor {

    private final JwtUtil jwtUtil;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        if (request instanceof ServletServerHttpRequest) {
            ServletServerHttpRequest servletRequest = (ServletServerHttpRequest) request;
            HttpServletRequest httpServletRequest = servletRequest.getServletRequest();
            String token = httpServletRequest.getParameter("token");

            if (StringUtils.hasText(token) && jwtUtil.validateToken(token)) {
                String username = jwtUtil.extractUsername(token);
                // Store connection details in attributes for the WebSocketSession
                attributes.put("username", username);
                attributes.put("token", token);
                attributes.put("connectTime", System.currentTimeMillis());
                log.info("[WebSocket] Handshake approved for user: {}", username);
                return true;
            }
        }
        log.warn("[WebSocket] Handshake rejected: unauthorized connection attempt");
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // No action required after handshake
    }
}
