package com.auralis.app;

import com.auralis.app.sync.SyncCursor;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SyncCursorTests {

    @Test
    void encodesAndDecodesOpaqueCursor() {
        SyncCursor cursor = new SyncCursor(42);

        assertThat(SyncCursor.decode(cursor.encode())).isEqualTo(cursor);
        assertThat(cursor.encode()).doesNotContain("42");
    }

    @Test
    void rejectsNegativeAndMalformedCursor() {
        assertThatThrownBy(() -> new SyncCursor(-1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SyncCursor.decode("not-a-cursor"))
                .isInstanceOf(RuntimeException.class);
    }
}
