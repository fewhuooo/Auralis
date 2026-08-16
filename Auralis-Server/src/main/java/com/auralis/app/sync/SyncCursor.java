package com.auralis.app.sync;

import com.auralis.app.shared.error.DomainException;

import java.nio.ByteBuffer;
import java.util.Base64;

public record SyncCursor(long value) {

    public SyncCursor {
        if (value < 0) {
            throw new IllegalArgumentException("Cursor cannot be negative");
        }
    }

    public String encode() {
        ByteBuffer buffer = ByteBuffer.allocate(Long.BYTES);
        buffer.putLong(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer.array());
    }

    public static SyncCursor decode(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            throw new DomainException("VALIDATION_FAILED", "Cursor is required");
        }
        try {
            byte[] bytes = Base64.getUrlDecoder().decode(encoded);
            if (bytes.length != Long.BYTES) {
                throw new IllegalArgumentException("Invalid cursor length");
            }
            return new SyncCursor(ByteBuffer.wrap(bytes).getLong());
        } catch (IllegalArgumentException exception) {
            throw new DomainException("VALIDATION_FAILED", "Cursor is invalid");
        }
    }
}
