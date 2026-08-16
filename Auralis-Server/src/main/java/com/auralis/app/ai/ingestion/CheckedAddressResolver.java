package com.auralis.app.ai.ingestion;

import java.net.InetAddress;
import java.util.List;

public final class CheckedAddressResolver {

    private final String host;
    private final List<InetAddress> addresses;

    private CheckedAddressResolver(String host, List<InetAddress> addresses) {
        this.host = host.toLowerCase(java.util.Locale.ROOT);
        this.addresses = List.copyOf(addresses);
    }

    public static CheckedAddressResolver forHost(String host, List<InetAddress> addresses) {
        if (host == null || host.isBlank() || addresses == null || addresses.isEmpty()) {
            throw new IllegalArgumentException("A checked host and address set are required");
        }
        return new CheckedAddressResolver(host, addresses);
    }

    public List<InetAddress> resolveHost(String requestedHost) {
        if (requestedHost == null || !host.equalsIgnoreCase(requestedHost)) {
            throw new IllegalArgumentException("Host is outside the checked address set");
        }
        return addresses;
    }
}
