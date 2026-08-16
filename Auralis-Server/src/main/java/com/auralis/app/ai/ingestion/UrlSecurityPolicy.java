package com.auralis.app.ai.ingestion;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
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
        if (isIpLiteral(host)) {
            for (InetAddress address : resolvePublicAddresses(uri)) {
                validateResolvedAddress(address);
            }
        }
        return uri;
    }

    public List<InetAddress> resolvePublicAddresses(URI uri) {
        if (uri == null || uri.getHost() == null) {
            throw new IllegalArgumentException("URL must include a host");
        }
        try {
            return Arrays.stream(InetAddress.getAllByName(uri.getHost()))
                    .peek(this::validateResolvedAddress)
                    .toList();
        } catch (UnknownHostException exception) {
            throw new IllegalArgumentException("URL host could not be resolved", exception);
        }
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
        byte[] bytes = address.getAddress();
        boolean ipv4MappedPrivate = bytes.length == 16
                && isIpv4Mapped(bytes)
                && isPrivateIpv4(bytes[12] & 0xff, bytes[13] & 0xff, bytes[14] & 0xff, bytes[15] & 0xff);
        return address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || ipv4MappedPrivate
                || isPrivateIpv6(bytes)
                || isPrivateIpv4(bytes);
    }

    private boolean isPrivateIpv4(byte[] bytes) {
        if (bytes.length != 4) {
            return false;
        }
        return isPrivateIpv4(bytes[0] & 0xff, bytes[1] & 0xff, bytes[2] & 0xff, bytes[3] & 0xff);
    }

    private boolean isPrivateIpv4(int first, int second, int third, int fourth) {
        return first == 0
                || first == 10
                || first == 127
                || (first == 100 && second >= 64 && second <= 127)
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 0)
                || (first == 192 && second == 168)
                || (first == 198 && (second == 18 || second == 19))
                || (first == 198 && second == 51 && third == 100)
                || (first == 203 && second == 0 && third == 113)
                || first >= 224;
    }

    private boolean isIpv4Mapped(byte[] bytes) {
        for (int index = 0; index < 10; index++) {
            if (bytes[index] != 0) {
                return false;
            }
        }
        return bytes[10] == (byte) 0xff && bytes[11] == (byte) 0xff;
    }

    private boolean isPrivateIpv6(byte[] bytes) {
        if (bytes.length != 16) {
            return false;
        }
        int first = bytes[0] & 0xff;
        int second = bytes[1] & 0xff;
        return (first & 0xfe) == 0xfc
                || (first == 0xfe && (second & 0xc0) == 0x80)
                || (first == 0x20 && second == 0x01
                && (bytes[2] & 0xff) == 0x0d && (bytes[3] & 0xff) == 0xb8);
    }
}
