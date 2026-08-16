package com.auralis.app;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.ingestion.TextChunker;
import com.auralis.app.ai.ingestion.UrlSecurityPolicy;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiIngestionTests {

    @Test
    void chunksTextWithStableOrdinalsOffsetsAndOverlap() {
        List<TextChunk> chunks = new TextChunker(10, 3).chunk("0123456789ABCDEFGHIJ");

        assertThat(chunks).extracting(TextChunk::ordinal).containsExactly(0, 1, 2);
        assertThat(chunks).extracting(TextChunk::content)
                .containsExactly("0123456789", "789ABCDEFG", "EFGHIJ");
        assertThat(chunks.get(1).charStart()).isEqualTo(7);
        assertThat(chunks.get(1).charEnd()).isEqualTo(17);
    }

    @Test
    void rejectsUnsafeUrlsAndAllowsOnlyPublicHttpSchemes() {
        UrlSecurityPolicy policy = new UrlSecurityPolicy();

        assertThatThrownBy(() -> policy.validate(URI.create("http://localhost:8080/private")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> policy.validate(URI.create("file:///private")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(policy.validate(URI.create("https://example.com/docs"))).isEqualTo(URI.create("https://example.com/docs"));
    }

    @Test
    void rejectsInvalidChunkConfigurationAndEmptyText() {
        assertThatThrownBy(() -> new TextChunker(10, 10))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TextChunker(10, 3).chunk("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
