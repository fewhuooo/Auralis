package com.auralis.app.ai.internal.security;

import javax.net.ssl.SSLSocket;
import java.io.IOException;
import java.net.Socket;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/** Tracks only sockets owned by one provider call; abort closes raw sockets before TLS wrappers. */
final class ProviderSocketRegistry {

    private final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean aborted = new AtomicBoolean();

    void register(Socket socket) {
        if (socket == null) return;
        if (aborted.get()) {
            closeQuietly(socket);
            return;
        }
        sockets.add(socket);
        if (aborted.get() && sockets.remove(socket)) closeQuietly(socket);
    }

    void abort() {
        if (!aborted.compareAndSet(false, true)) return;
        for (Socket socket : sockets) {
            if (!(socket instanceof SSLSocket)) closeQuietly(socket);
        }
        // Closing the raw socket unblocks TLS I/O. The calling request thread then closes TLS in finally.
    }

    void clear() { sockets.clear(); }

    private void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // A concurrent read/write or disconnect may already have closed it.
        }
    }
}
