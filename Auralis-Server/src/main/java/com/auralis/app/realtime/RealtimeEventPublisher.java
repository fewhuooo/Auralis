package com.auralis.app.realtime;

import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.function.Consumer;

@Component
public class RealtimeEventPublisher {
    private final ConcurrentHashMap<UUID, CopyOnWriteArraySet<Consumer<RealtimeEventView>>> subscribers =
            new ConcurrentHashMap<>();

    public AutoCloseable subscribe(UUID userId, Consumer<RealtimeEventView> subscriber) {
        var bucket = subscribers.computeIfAbsent(userId, ignored -> new CopyOnWriteArraySet<>());
        bucket.add(subscriber);
        return () -> {
            bucket.remove(subscriber);
            if (bucket.isEmpty()) {
                subscribers.remove(userId, bucket);
            }
        };
    }

    public void publish(UUID userId, RealtimeEventView event) {
        subscribers.getOrDefault(userId, new CopyOnWriteArraySet<>()).forEach(subscriber -> subscriber.accept(event));
    }
}
