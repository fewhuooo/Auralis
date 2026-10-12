package com.auralis.app.ai.internal.security;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.SocketException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class ProviderSocketRegistryTests {

    @Test
    void abortClosesRegisteredRawSocketAndUnblocksConnect() throws Exception {
        ProviderSocketRegistry registry = new ProviderSocketRegistry();
        BlockingConnectSocket socket = new BlockingConnectSocket();
        registry.register(socket);
        ExecutorService connector = Executors.newSingleThreadExecutor();
        try {
            Future<?> connect = connector.submit(() -> {
                try {
                    socket.connect(null, 0);
                    throw new AssertionError("connect should have been released by close");
                } catch (IOException expected) {
                    return null;
                }
            });
            assertThat(socket.connectEntered.await(1, TimeUnit.SECONDS)).isTrue();
            registry.abort();
            connect.get(1, TimeUnit.SECONDS);
            assertThat(socket.closeCalled.getCount()).isZero();
            assertThat(socket.connectExited.getCount()).isZero();
        } finally {
            registry.clear();
            connector.shutdownNow();
            assertThat(connector.awaitTermination(2, TimeUnit.SECONDS)).isTrue();
        }
    }

    private static final class BlockingConnectSocket extends Socket {
        private final CountDownLatch connectEntered = new CountDownLatch(1);
        private final CountDownLatch closeCalled = new CountDownLatch(1);
        private final CountDownLatch connectExited = new CountDownLatch(1);

        @Override
        public void connect(SocketAddress endpoint, int timeout) throws IOException {
            connectEntered.countDown();
            try {
                if (!closeCalled.await(2, TimeUnit.SECONDS)) throw new SocketException("test connect timed out");
                throw new SocketException("socket closed during connect");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IOException(interrupted);
            } finally {
                connectExited.countDown();
            }
        }

        @Override
        public synchronized void close() {
            closeCalled.countDown();
        }
    }
}
