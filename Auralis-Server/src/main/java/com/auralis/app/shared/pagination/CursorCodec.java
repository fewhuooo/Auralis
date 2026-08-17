package com.auralis.app.shared.pagination;

import com.auralis.app.shared.error.DomainException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public final class CursorCodec {

    private static final String VERSION = "v1";

    private CursorCodec() {
    }

    public static String encode(String resource, String sortKey, Instant updatedAt, UUID id) {
        return String.join(".", VERSION, resource,
                encodePart(sortKey == null ? "" : sortKey),
                encodePart(updatedAt.toString()), id.toString());
    }

    public static Cursor decode(String resource, String encoded) {
        if (encoded == null || encoded.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "Cursor must not be blank");
        }
        try {
            String[] parts = encoded.split("\\.", -1);
            if (parts.length != 5 || !VERSION.equals(parts[0]) || !resource.equals(parts[1])) {
                throw new IllegalArgumentException("Cursor resource or version mismatch");
            }
            return new Cursor(
                    decodePart(parts[2]),
                    Instant.parse(decodePart(parts[3])),
                    UUID.fromString(parts[4]));
        } catch (RuntimeException exception) {
            if (exception instanceof DomainException domainException) {
                throw domainException;
            }
            throw new DomainException("VALIDATION_FAILED", "Cursor is invalid");
        }
    }

    private static String encodePart(String value) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String decodePart(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    public record Cursor(String sortKey, Instant updatedAt, UUID id) {
    }
}
