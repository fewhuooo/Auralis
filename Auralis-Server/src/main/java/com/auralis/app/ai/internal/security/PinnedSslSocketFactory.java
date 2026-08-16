package com.auralis.app.ai.internal.security;

import javax.net.ssl.SSLSocketFactory;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;

public final class PinnedSslSocketFactory extends SSLSocketFactory {

    private final SSLSocketFactory delegate;
    private final List<InetAddress> addresses;
    private final int port;
    private final int timeoutMillis;

    public PinnedSslSocketFactory(
            SSLSocketFactory delegate,
            List<InetAddress> addresses,
            int port,
            int timeoutMillis) {
        this.delegate = delegate;
        this.addresses = List.copyOf(addresses);
        this.port = port;
        this.timeoutMillis = timeoutMillis;
    }

    @Override
    public Socket createSocket(String host, int port) throws IOException {
        return connectPinned(host, port);
    }

    @Override
    public Socket createSocket(String host, int port, InetAddress localAddress, int localPort)
            throws IOException {
        return connectPinned(host, port);
    }

    @Override
    public Socket createSocket(InetAddress host, int port) throws IOException {
        return connectPinned(host.getHostName(), port);
    }

    @Override
    public Socket createSocket(InetAddress host, int port, InetAddress localAddress, int localPort)
            throws IOException {
        return connectPinned(host.getHostName(), port);
    }

    @Override
    public Socket createSocket(Socket socket, String host, int port, boolean autoClose) throws IOException {
        if (socket == null || !socket.isConnected() || !addresses.contains(socket.getInetAddress())) {
            throw new IOException("TLS socket is outside the checked address set");
        }
        return delegate.createSocket(socket, host, port, autoClose);
    }

    @Override
    public Socket createSocket() throws IOException {
        throw new IOException("Pinned TLS socket requires a provider hostname");
    }

    @Override
    public String[] getDefaultCipherSuites() {
        return delegate.getDefaultCipherSuites();
    }

    @Override
    public String[] getSupportedCipherSuites() {
        return delegate.getSupportedCipherSuites();
    }

    private Socket connectPinned(String host, int requestedPort) throws IOException {
        IOException lastException = null;
        int targetPort = requestedPort == 0 ? port : requestedPort;
        for (InetAddress address : addresses) {
            Socket plain = new Socket();
            try {
                plain.connect(new InetSocketAddress(address, targetPort), timeoutMillis);
                return delegate.createSocket(plain, host, targetPort, true);
            } catch (IOException exception) {
                lastException = exception;
                try {
                    plain.close();
                } catch (IOException ignored) {
                    // Preserve the connection failure.
                }
            }
        }
        if (lastException != null) {
            throw lastException;
        }
        throw new IOException("Pinned TLS target has no resolved addresses");
    }
}
