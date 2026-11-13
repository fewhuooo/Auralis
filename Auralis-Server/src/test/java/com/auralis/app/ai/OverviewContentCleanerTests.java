package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewContentCleanerTests {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void removesOnlyClosedLineRangesAndPreservesTextAndOriginalOffsets() {
        String original = "封面\r\n正文😀\n目录\r第二段";
        var input = OverviewContentCleaner.prepare(original);
        var result = OverviewContentCleaner.apply(JSON, input, """
                {"exclusions":[{"startLine":1,"endLine":1,"category":"COVER_COPYRIGHT","reason":"封面"},
                {"startLine":3,"endLine":3,"category":"TOC","reason":"目录"}]}
                """);
        assertThat(input.lines()).hasSize(4);
        assertThat(result.text()).isEqualTo("正文😀\n第二段");
        assertThat(result.retained()).hasSize(2);
        for (var span : result.retained()) {
            assertThat(result.text().substring(span.cleanedStart(), span.cleanedEnd()))
                    .isEqualTo(original.substring(span.originalStart(), span.originalEnd()));
        }
    }

    @Test
    void emptyExclusionsRetainEntireSourceWithoutNormalization() {
        String original = "第一行\r\n\r\n正文😀";
        assertThat(OverviewContentCleaner.apply(JSON, OverviewContentCleaner.prepare(original),
                "{\"exclusions\":[]}").text()).isEqualTo(original);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"exclusions\":[{\"startLine\":0,\"endLine\":1,\"category\":\"TOC\",\"reason\":\"x\"}]}",
            "{\"exclusions\":[{\"startLine\":1,\"endLine\":4,\"category\":\"TOC\",\"reason\":\"x\"}]}",
            "{\"exclusions\":[{\"startLine\":1,\"endLine\":1,\"category\":\"NOISE\",\"reason\":\"x\"}]}",
            "{\"exclusions\":[],\"other\":true}",
            "{\"exclusions\":[],\"exclusions\":[]}",
            "{\"exclusions\":[]} {}",
            "{\"exclusions\":[{\"startLine\":1,\"endLine\":2,\"category\":\"TOC\",\"reason\":\"x\"},{\"startLine\":2,\"endLine\":3,\"category\":\"TOC\",\"reason\":\"x\"}]}"
    })
    void rejectsInvalidExternalRangesInsteadOfReturningOriginal(String response) {
        assertThatThrownBy(() -> OverviewContentCleaner.apply(JSON,
                OverviewContentCleaner.prepare("a\nb\nc"), response)).isInstanceOf(DomainException.class);
    }

    @Test
    void rejectsExclusionOfAllContent() {
        assertThatThrownBy(() -> OverviewContentCleaner.apply(JSON, OverviewContentCleaner.prepare("正文"),
                """
                {"exclusions":[{"startLine":1,"endLine":1,"category":"TOC","reason":"x"}]}
                """)).isInstanceOf(DomainException.class);
    }
}
