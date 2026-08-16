package com.auralis.app.ai.ingestion;

import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

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
            current = validateDnsTargets(current);
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) current.toURL().openConnection();
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

    private URI validateDnsTargets(URI uri) {
        try {
            for (java.net.InetAddress address : java.net.InetAddress.getAllByName(uri.getHost())) {
                securityPolicy.validateResolvedAddress(address);
            }
            return uri;
        } catch (Exception exception) {
            throw new DomainException("INGESTION_FAILED", "URL target is not public");
        }
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
