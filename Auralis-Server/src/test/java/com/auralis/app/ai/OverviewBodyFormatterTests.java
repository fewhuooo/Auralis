package com.auralis.app.ai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewBodyFormatterTests {

    @Test
    void normalizesAtxHeadingDepthOutsideCodeAndLeavesIndentedAndFencedHashesAlone() {
        String source = "## Main\n#### Detail\n```java\n# code\n```\n    # indented\n";

        List<String> parts = OverviewBodyFormatter.splitAndNormalize(source, 400);

        assertThat(String.join("", parts)).isEqualTo("### Main\n##### Detail\n```java\n# code\n```\n    # indented\n");
    }

    @Test
    void splitsFencedCodeOnlyAtCompleteLinesAndBalancesEveryPart() {
        String source = "```\none\ntwo\nthree\nfour\n```\n";

        List<String> parts = OverviewBodyFormatter.splitAndNormalize(source, 20);

        assertThat(parts).hasSizeGreaterThan(1);
        assertThat(parts).allSatisfy(part -> {
            assertThat(part.length()).isLessThanOrEqualTo(20);
            assertThat(part.startsWith("```\n")).isTrue();
            assertThat(part.endsWith("```\n")).isTrue();
        });
        assertThat(parts.stream().map(part -> part.replaceFirst("^```\\n", "").replaceFirst("```\\n$", "")))
                .containsExactly("one\ntwo\n", "three\nfour\n");
    }

    @Test
    void repeatsTableHeaderAndSeparatorWhenRowsNeedMultipleParts() {
        String source = "| Name | Value |\n| --- | --- |\n| first | 123456 |\n| second | 234567 |\n| third | 345678 |\n";

        List<String> parts = OverviewBodyFormatter.splitAndNormalize(source, 55);

        assertThat(parts).hasSizeGreaterThan(1);
        assertThat(parts).allSatisfy(part -> {
            assertThat(part.length()).isLessThanOrEqualTo(55);
            assertThat(part).startsWith("| Name | Value |\n| --- | --- |\n");
        });
        assertThat(parts).allSatisfy(part -> assertThat(part.lines().filter(line -> line.startsWith("| ")).count())
                .isGreaterThanOrEqualTo(3));
    }

    @Test
    void paragraphSplittingPreservesEveryCharacterAndDoesNotSplitSurrogatePairs() {
        String source = "第一句 🙂 保留；第二句继续。\n\n第三段也保留。";

        List<String> parts = OverviewBodyFormatter.splitAndNormalize(source, 12);

        assertThat(parts).allSatisfy(part -> assertThat(part.length()).isLessThanOrEqualTo(12));
        assertThat(String.join("", parts)).isEqualTo(source);
        assertThat(String.join("", parts)).contains("🙂");
    }

    @Test
    void failsClearlyWhenAnIndivisibleTableRowCannotFitWithItsHeader() {
        String source = "| Name | Value |\n| --- | --- |\n| " + "x".repeat(80) + " |\n";

        assertThatThrownBy(() -> OverviewBodyFormatter.splitAndNormalize(source, 40))
                .isInstanceOf(OverviewBodyFormatter.CapacityException.class)
                .hasMessageContaining("row");
    }

    @Test
    void rejectsAnUnbreakableOrdinaryLineInsteadOfDroppingOrArbitrarilyCuttingIt() {
        String source = "x".repeat(30);

        assertThatThrownBy(() -> OverviewBodyFormatter.splitAndNormalize(source, 10))
                .isInstanceOf(OverviewBodyFormatter.CapacityException.class)
                .hasMessageContaining("safe boundary");
    }

    @Test
    void everyFormattedPartStaysWithinTheRequestedMaximum() {
        String source = ("A sentence with several words. Another sentence follows.\n\n").repeat(90);

        List<String> parts = OverviewBodyFormatter.splitAndNormalize(source, 4_000);

        assertThat(parts).isNotEmpty().allSatisfy(part -> assertThat(part.length()).isLessThanOrEqualTo(4_000));
        assertThat(String.join("", parts)).isEqualTo(source);
    }

    @Test
    void acceptsFullMarkdownBeyondTheFormerInputCeilingWhenNoChunkLimitIsRequested() {
        String source = ("A sentence with preserved detail. ").repeat(2_000);

        List<String> parts = OverviewBodyFormatter.splitAndNormalize(source, Integer.MAX_VALUE);

        assertThat(parts).containsExactly(source);
    }

    @Test
    void headingsExtractionIsBoundedAndIgnoresFencedCode() {
        String markdown = "# First\n```\n# hidden\n```\n## Second\n### Third\n";

        assertThat(OverviewBodyFormatter.headings(markdown, 2, 12)).containsExactly("First", "Second");
        assertThat(OverviewBodyFormatter.headings(markdown, 1, 5)).containsExactly("First");
        assertThat(OverviewBodyFormatter.headings(markdown, 1, 4)).isEmpty();
    }

}
