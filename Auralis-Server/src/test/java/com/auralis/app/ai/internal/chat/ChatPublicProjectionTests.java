package com.auralis.app.ai.internal.chat;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ChatPublicProjectionTests {
    @Test
    void questionStemProducesCanonicalQuestionPartAndMarkdown() {
        Map<String, Object> stem = Map.of("type", "stem", "question", "Why does this follow?",
                "placeholder", "Explain your reasoning");

        String delta = ChatPublicProjection.publicTextDelta(DisplayComponent.QUESTION, stem);
        Map<String, Object> part = ChatPublicProjection.blockPart("block-1",
                DisplayComponent.QUESTION, List.of(stem), "READY", "activity-1");

        assertThat(delta).isEqualTo("**Why does this follow?**\n");
        assertThat(part).containsEntry("component", "question")
                .containsEntry("questionId", "activity-1")
                .containsEntry("state", "READY");
        assertThat(ChatPublicProjection.markdown(List.of(part)))
                .isEqualTo("\n**Why does this follow?**\n\n");
    }

    @Test
    void componentProjectionUsesProtocolNamesAndSubmittedAnswerOnly() {
        Map<String, Object> meta = Map.of("type", "meta", "title", "Plan");
        Map<String, Object> item = Map.of("type", "item", "title", "Check evidence");
        Map<String, Object> part = ChatPublicProjection.blockPart("block-2",
                DisplayComponent.STEPS, List.of(meta, item), "READY");

        assertThat(part).containsEntry("component", "steps");
        assertThat(ChatPublicProjection.markdown(List.of(part))).contains("### Plan", "- **Check evidence**");
        assertThat(part).doesNotContainKey("privateReference").doesNotContainKey("reference");
    }

    @Test
    void compareProjectsEachDimensionAsAnOrderedVerticalEntryList() {
        Map<String, Object> meta = Map.of("type", "meta", "title", "HTTP polling vs SSE",
                "description", "Overview", "internal", "drop");
        Map<String, Object> first = Map.of("type", "item", "title", "Communication pattern",
                "entries", List.of(Map.of("label", "HTTP polling", "text", "Periodic requests", "secret", "drop"),
                        Map.of("label", "SSE", "text", "Server stream")), "description", "drop");
        Map<String, Object> second = Map.of("type", "item", "title", "Update timing",
                "entries", List.of(Map.of("label", "HTTP polling", "text", "Next poll"),
                        Map.of("label", "SSE", "text", "As sent")));

        Map<String, Object> part = ChatPublicProjection.blockPart("block-compare",
                DisplayComponent.COMPARE, List.of(meta, first, second), "READY");

        assertThat(part.get("meta")).isEqualTo(Map.of("title", "HTTP polling vs SSE", "description", "Overview"));
        List<?> projectedItems = (List<?>) part.get("items");
        assertThat(projectedItems).hasSize(2);
        assertThat(projectedItems.get(0)).isEqualTo(Map.of("title", "Communication pattern", "entries", List.of(
                        Map.of("label", "HTTP polling", "text", "Periodic requests"),
                        Map.of("label", "SSE", "text", "Server stream"))));
        assertThat(projectedItems.get(1)).isEqualTo(Map.of("title", "Update timing", "entries", List.of(
                        Map.of("label", "HTTP polling", "text", "Next poll"),
                        Map.of("label", "SSE", "text", "As sent"))));
        assertThat(ChatPublicProjection.publicTextDelta(DisplayComponent.COMPARE, first))
                .isEqualTo("### Communication pattern\n- **HTTP polling**: Periodic requests\n- **SSE**: Server stream\n");
        String markdown = ChatPublicProjection.markdown(List.of(part));
        assertThat(markdown).containsSubsequence("### Communication pattern", "- **HTTP polling**: Periodic requests",
                "- **SSE**: Server stream", "### Update timing", "- **HTTP polling**: Next poll", "- **SSE**: As sent");
        assertThat(markdown).doesNotContain("drop", "secret");
    }
}
