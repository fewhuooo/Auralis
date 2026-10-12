package com.auralis.app.ai.ingestion;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class IngestionBudgetCalibrationTests {

    private static final int MAX_CALLS = 512;
    private static final long MAX_TASK_TOKENS = 16_777_216L;
    private static final int MAX_BATCH_ITEMS = 32;
    private static final long MAX_BATCH_BYTES = 32_768L;

    @Test
    void legalFiveMiBRawInputsFitIngestionCallAndTokenBudgets() {
        assertFits("raw-ascii", "a".repeat(5_242_880), 180, 5_825_360L);
        assertFits("raw-two-byte", "\u07ff".repeat(2_621_440), 187, 5_825_360L);
        assertFits("raw-three-byte", "\u0800".repeat(1_747_626), 180, 5_825_358L);
        assertFits("raw-supplementary", "😀".repeat(1_310_720), 187, 5_825_360L);
    }

    @Test
    void legalTwoMillionCharacterParsedDocumentFitsIngestionBudgets() {
        assertFits("parsed-ascii", "a".repeat(2_000_000), 69, 2_222_120L);
        assertFits("parsed-two-byte", "\u07ff".repeat(2_000_000), 143, 4_444_240L);
        assertFits("parsed-three-byte", "\u0800".repeat(2_000_000), 206, 6_666_360L);
        assertFits("parsed-supplementary", "😀".repeat(1_000_000), 143, 4_444_240L);
    }

    private void assertFits(String caseName, String text, int expectedCalls, long expectedEstimatedTokens) {
        List<TextChunk> chunks = new TextChunker(1200, 120).chunk(text);
        List<List<TextChunk>> batches = worker().embeddingBatches(chunks);
        long estimatedTokens = batches.stream().flatMap(List::stream)
                .mapToLong(chunk -> chunk.content().getBytes(StandardCharsets.UTF_8).length)
                .sum();

        assertThat(batches).as("%s embedding call count", caseName).hasSize(expectedCalls)
                .hasSizeLessThanOrEqualTo(MAX_CALLS);
        assertThat(estimatedTokens).as("%s estimated input tokens", caseName)
                .isEqualTo(expectedEstimatedTokens)
                .isLessThanOrEqualTo(MAX_TASK_TOKENS);
        assertThat(batches).as("%s respects provider batch byte ceiling", caseName)
                .allSatisfy(batch -> assertThat(batch.stream()
                        .mapToLong(chunk -> chunk.content().getBytes(StandardCharsets.UTF_8).length).sum())
                        .isLessThanOrEqualTo(MAX_BATCH_BYTES));
    }

    private IngestionWorker worker() {
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.ingestionEmbeddingBatchMaxItems()).thenReturn(MAX_BATCH_ITEMS);
        when(ai.ingestionEmbeddingBatchMaxUtf8Bytes()).thenReturn(MAX_BATCH_BYTES);
        return new IngestionWorker(null, null, null, null, null, null, null, null, properties);
    }
}
