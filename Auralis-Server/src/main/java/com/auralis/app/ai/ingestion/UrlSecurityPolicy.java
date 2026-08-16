package com.auralis.app.ai.ingestion;

import java.net.InetAddress;
import java.net.URI;
import org.springframework.stereotype.Component;

@Component
public class UrlSecurityPolicy {

    public URI validate(URI uri) {
        if (uri == null || uri.getHost() == null
                || !("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("URL must be HTTP or HTTPS without user information");
        }
        String host = uri.getHost().toLowerCase(java.util.Locale.ROOT);
        if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local")) {
            throw new IllegalArgumentException("Local URL targets are not allowed");
        }
        try {
            InetAddress address = InetAddress.getByName(host);
            if (isIpLiteral(host) && isPrivate(address)) {
                throw new IllegalArgumentException("Private URL targets are not allowed");
            }
        } catch (java.net.UnknownHostException ignored) {
            // DNS names are resolved and checked again immediately before connection.
        }
        return uri;
    }

    public void validateResolvedAddress(InetAddress address) {
        if (address == null || isPrivate(address)) {
            throw new IllegalArgumentException("Private URL targets are not allowed");
        }
    }

    private boolean isIpLiteral(String host) {
        return host.matches("[0-9.]+") || host.contains(":");
    }

    private boolean isPrivate(InetAddress address) {
        return address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress();
    }
}
