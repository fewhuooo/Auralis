package com.auralis.app.ai.internal.security;

import java.net.InetAddress;
import java.util.List;

public record ResolvedProviderEndpoint(String host, int port, List<InetAddress> addresses, String basePath) {

    public ResolvedProviderEndpoint(String host, int port, List<InetAddress> addresses) {
        this(host, port, addresses, "/");
    }

    public ResolvedProviderEndpoint {
        addresses = List.copyOf(addresses);
        basePath = basePath == null || basePath.isBlank() ? "/" : basePath;
    }
}
