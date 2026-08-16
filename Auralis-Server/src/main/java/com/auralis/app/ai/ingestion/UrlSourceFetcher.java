package com.auralis.app.ai.ingestion;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import javax.net.ssl.HttpsURLConnection;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class UrlSourceFetcher {

    private final AuralisProperties properties;
    private final UrlSecurityPolicy securityPolicy;

    public UrlSourceFetcher(AuralisProperties properties, UrlSecurityPolicy securityPolicy) {
        this.properties = properties;
        this.securityPolicy = securityPolicy;
    }

    public String fetch(String rawUrl) {
        URI current;
        try {
            current = securityPolicy.validate(URI.create(rawUrl));
        } catch (IllegalArgumentException exception) {
            throw new DomainException("INGESTION_FAILED", "URL is not allowed");
        }
        for (int redirect = 0; redirect <= properties.ai().urlMaxRedirects(); redirect++) {
            CheckedAddressResolver checkedResolver = validateDnsTargets(current);
            HttpURLConnection connection = null;
            try {
                connection = openConnection(current, checkedResolver);
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(Math.toIntExact(properties.ai().urlConnectTimeoutMillis()));
                connection.setReadTimeout(Math.toIntExact(properties.ai().urlReadTimeoutMillis()));
                connection.setRequestMethod("GET");
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null || redirect == properties.ai().urlMaxRedirects()) {
                        throw new DomainException("INGESTION_FAILED", "URL redirect limit was exceeded");
                    }
                    current = securityPolicy.validate(current.resolve(location));
                    continue;
                }
                if (status < 200 || status >= 300) {
                    throw new DomainException("INGESTION_FAILED", "URL returned an unsuccessful response");
                }
                return readBounded(connection.getInputStream(), properties.ai().ingestionMaxBytes());
            } catch (DomainException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new DomainException("INGESTION_FAILED", "URL could not be fetched");
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }
        throw new DomainException("INGESTION_FAILED", "URL redirect limit was exceeded");
    }

    private CheckedAddressResolver validateDnsTargets(URI uri) {
        try {
            return CheckedAddressResolver.forHost(
                    uri.getHost(), securityPolicy.resolvePublicAddresses(uri));
        } catch (Exception exception) {
            throw new DomainException("INGESTION_FAILED", "URL target is not public");
        }
    }

    private HttpURLConnection openConnection(URI uri, CheckedAddressResolver checkedResolver) throws Exception {
        List<InetAddress> addresses = checkedResolver.resolveHost(uri.getHost());
        if ("https".equalsIgnoreCase(uri.getScheme())) {
            HttpsURLConnection connection = (HttpsURLConnection) uri.toURL().openConnection();
            connection.setSSLSocketFactory(new com.auralis.app.ai.internal.security.PinnedSslSocketFactory(
                    HttpsURLConnection.getDefaultSSLSocketFactory(),
                    addresses,
                    uri.getPort() == -1 ? 443 : uri.getPort(),
                    Math.toIntExact(properties.ai().urlConnectTimeoutMillis())));
            connection.setHostnameVerifier(HttpsURLConnection.getDefaultHostnameVerifier());
            return connection;
        }
        InetAddress selectedAddress = addresses.get(0);
        URI pinnedUri = new URI(
                uri.getScheme(),
                null,
                selectedAddress.getHostAddress(),
                uri.getPort(),
                uri.getPath(),
                uri.getQuery(),
                null);
        HttpURLConnection connection = (HttpURLConnection) pinnedUri.toURL().openConnection();
        connection.setRequestProperty("Host", hostHeader(uri));
        return connection;
    }

    private String hostHeader(URI uri) {
        String host = uri.getHost();
        if (uri.getPort() == -1) {
            return host;
        }
        return host + ":" + uri.getPort();
    }

    private String readBounded(InputStream input, long maxBytes) throws java.io.IOException {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            long total = 0;
            int count;
            while ((count = stream.read(buffer)) != -1) {
                total += count;
                if (total > maxBytes) {
                    throw new DomainException("INGESTION_FAILED", "URL response exceeds the ingestion limit");
                }
                output.write(buffer, 0, count);
            }
            String text = output.toString(StandardCharsets.UTF_8);
            if (text.isBlank()) {
                throw new DomainException("INGESTION_FAILED", "URL response is empty");
            }
            return text.trim();
        }
    }
}
