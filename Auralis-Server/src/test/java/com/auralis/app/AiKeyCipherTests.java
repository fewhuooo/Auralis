package com.auralis.app;

import com.auralis.app.ai.internal.security.AiKeyCipher;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiKeyCipherTests {

    private static final String KEY = "01234567890123456789012345678901";

    @Test
    void encryptsAndDecryptsWithoutStoringPlaintext() {
        AiKeyCipher cipher = new AiKeyCipher(KEY);

        String encrypted = cipher.encrypt("sk-secret-value");

        assertThat(encrypted).isNotBlank().doesNotContain("sk-secret-value");
        assertThat(cipher.decrypt(encrypted)).isEqualTo("sk-secret-value");
        assertThat(cipher.encrypt("sk-secret-value")).isNotEqualTo(encrypted);
    }

    @Test
    void rejectsAnInvalidEncryptionKey() {
        assertThatThrownBy(() -> new AiKeyCipher("too-short"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
