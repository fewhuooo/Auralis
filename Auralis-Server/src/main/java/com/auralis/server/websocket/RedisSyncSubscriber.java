package com.auralis.server.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

/**
 * 14.5 Redis Sync Subscriber
 * Listens for SyncEvent messages on Redis "Auralis:sync" channel
 * and broadcasts them to all connected WebSocket clients.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisSyncSubscriber implements MessageListener {

    private final SyncWebSocketHandler webSocketHandler;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            // Redis Template serializes values as JSON, but we get raw bytes here
            // GenericJackson2JsonRedisSerializer usually includes type info
            // For simplicity in this implementation, we'll parse the body directly
            String body = new String(message.getBody());
            
            // Clean up JSON if it contains type info from GenericJackson2JsonRedisSerializer
            // (Standard behavior for that serializer)
            if (body.startsWith("[\"com.auralis.server.common.SyncEvent\"")) {
                 // It's a typed JSON array, we can just broadcast the string as-is
                 // or parse/re-serialize. Broadcasting directly is more efficient.
                 webSocketHandler.broadcast(body);
            } else {
                // Just in case it's raw JSON
                webSocketHandler.broadcast(body);
            }
            
            log.debug("[RedisSync] Received event and broadcasted to WS");
        } catch (Exception e) {
            log.error("[RedisSync] Failed to process sync message", e);
        }
    }
}
