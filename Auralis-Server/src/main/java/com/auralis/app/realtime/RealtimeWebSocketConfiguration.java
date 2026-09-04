package com.auralis.app.realtime;

import tools.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration(proxyBeanMethods = false)
@EnableWebSocket
public class RealtimeWebSocketConfiguration implements WebSocketConfigurer {
    private final RealtimeService realtimeService;
    private final RealtimeEventPublisher publisher;
    private final ObjectMapper objectMapper;

    public RealtimeWebSocketConfiguration(RealtimeService realtimeService,
                                          RealtimeEventPublisher publisher,
                                          ObjectMapper objectMapper) {
        this.realtimeService = realtimeService;
        this.publisher = publisher;
        this.objectMapper = objectMapper;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new RealtimeWebSocketHandler(publisher, objectMapper), "/ws/events")
                .addInterceptors(new RealtimeWebSocketHandshakeInterceptor(realtimeService))
                .setAllowedOriginPatterns("*");
    }
}
