package com.auralis.app.ai.internal.security;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class ProviderEndpointPolicy {

    private final Set<String> allowedProviderHosts;
    private final DnsResolver dnsResolver;

    @Autowired
    public ProviderEndpointPolicy(AuralisProperties properties) {
        this(properties.ai().allowedProviderHosts(), InetAddress::getAllByName);
    }

    public ProviderEndpointPolicy(List<String> allowedProviderHosts) {
        this(allowedProviderHosts, InetAddress::getAllByName);
    }

    ProviderEndpointPolicy(List<String> allowedProviderHosts, DnsResolver dnsResolver) {
        this.allowedProviderHosts = allowedProviderHosts == null
                ? Set.of()
                : allowedProviderHosts.stream()
                .filter(host -> host != null && !host.isBlank())
                .map(this::normalizeHost)
                .collect(Collectors.toUnmodifiableSet());
        this.dnsResolver = dnsResolver == null ? InetAddress::getAllByName : dnsResolver;
    }

    public URI validate(AiProviderType provider, String rawBaseUrl) {
        if (provider == null || rawBaseUrl == null || rawBaseUrl.isBlank()) {
            throw invalidUrl();
        }
        URI uri;
        try {
            uri = URI.create(rawBaseUrl.trim());
        } catch (IllegalArgumentException exception) {
            throw invalidUrl();
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getUserInfo() != null
                || uri.getHost() == null
                || uri.getHost().isBlank()
                || uri.getQuery() != null
                || uri.getFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw invalidUrl();
        }
        String host = normalizeHost(uri.getHost());
        if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local")
                || host.endsWith(".internal")
                || (provider != AiProviderType.OPENAI_COMPATIBLE && !allowedProviderHosts.contains(host))) {
            throw invalidUrl();
        }
        if (isIpLiteral(host)) {
            validatePublicAddress(host);
        }
        return uri;
    }

    public ResolvedProviderEndpoint resolve(AiProviderType provider, URI baseUri) {
        URI validated = validate(provider, baseUri == null ? null : baseUri.toString());
        List<InetAddress> addresses = resolvePublicAddresses(validated);
        return new ResolvedProviderEndpoint(
                normalizeHost(validated.getHost()),
                validated.getPort() == -1 ? 443 : validated.getPort(),
                addresses,
                validated.getRawPath() == null || validated.getRawPath().isBlank() ? "/" : validated.getRawPath());
    }

    public List<InetAddress> resolvePublicAddresses(URI uri) {
        if (uri == null || uri.getHost() == null) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider target is unavailable");
        }
        try {
            InetAddress[] addresses = dnsResolver.resolve(uri.getHost());
            if (addresses == null || addresses.length == 0) {
                throw new UnknownHostException(uri.getHost());
            }
            List<InetAddress> publicAddresses = Arrays.stream(addresses)
                    .filter(address -> address != null && isPublicAddress(address))
                    .toList();
            if (publicAddresses.isEmpty()) {
                throw invalidUrl();
            }
            return publicAddresses;
        } catch (UnknownHostException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider target is unavailable");
        }
    }

    private void validatePublicAddress(String host) {
        try {
            validatePublicAddress(InetAddress.getByName(host));
        } catch (UnknownHostException exception) {
            throw new DomainException("MODEL_UNAVAILABLE", "AI provider target is unavailable");
        }
    }

    private void validatePublicAddress(InetAddress address) {
        if (!isPublicAddress(address)) {
            throw new DomainException("VALIDATION_FAILED", "Provider URL is not allowed");
        }
    }

    private boolean isPublicAddress(InetAddress address) {
        if (address == null) {
            return false;
        }
        byte[] bytes = address.getAddress();
        return !(address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || isPrivateIpv4(bytes)
                || isPrivateIpv6(bytes)
                || isIpv4MappedPrivate(bytes));
    }

    private boolean isPrivateIpv4(byte[] bytes) {
        if (bytes.length != 4) {
            return false;
        }
        int first = bytes[0] & 0xff;
        int second = bytes[1] & 0xff;
        int third = bytes[2] & 0xff;
        return first == 0
                || first == 10
                || first == 127
                || (first == 100 && second >= 64 && second <= 127)
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && (second == 0 || second == 168))
                || (first == 198 && (second == 18 || second == 19 || (second == 51 && third == 100)))
                || (first == 203 && second == 0 && third == 113)
                || first >= 224;
    }

    private boolean isIpv4MappedPrivate(byte[] bytes) {
        if (bytes.length != 16) {
            return false;
        }
        for (int index = 0; index < 10; index++) {
            if (bytes[index] != 0) {
                return false;
            }
        }
        return bytes[10] == (byte) 0xff && bytes[11] == (byte) 0xff
                && isPrivateIpv4(new byte[]{bytes[12], bytes[13], bytes[14], bytes[15]});
    }

    private boolean isPrivateIpv6(byte[] bytes) {
        if (bytes.length != 16) {
            return false;
        }
        // Reject well-known and local-use NAT64 prefixes: they can route an embedded private IPv4 target.
        if (hasIpv6Prefix(bytes, 0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0)
                || hasIpv6Prefix(bytes, 0x00, 0x64, 0xff, 0x9b, 0, 1)) {
            return true;
        }
        // Reject transition prefixes that encapsulate IPv4 addresses and can tunnel to non-public targets.
        if (hasIpv6Prefix(bytes, 0x20, 0x02) // 6to4
                || hasIpv6Prefix(bytes, 0x20, 0x01, 0, 0)) { // Teredo
            return true;
        }
        int first = bytes[0] & 0xff;
        int second = bytes[1] & 0xff;
        return (first & 0xfe) == 0xfc
                || (first == 0xfe && (second & 0xc0) == 0x80)
                || (first == 0x20 && second == 0x01
                && (bytes[2] & 0xff) == 0x0d && (bytes[3] & 0xff) == 0xb8);
    }

    private boolean hasIpv6Prefix(byte[] address, int... prefix) {
        for (int index = 0; index < prefix.length; index++) {
            if ((address[index] & 0xff) != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private boolean isIpLiteral(String host) {
        return host.matches("[0-9.]+") || host.contains(":");
    }

    private String normalizeHost(String host) {
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("[") && normalized.endsWith("]")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        while (normalized.endsWith(".")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private DomainException invalidUrl() {
        return new DomainException("VALIDATION_FAILED", "Provider URL is not allowed");
    }

    @FunctionalInterface
    interface DnsResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }
}
