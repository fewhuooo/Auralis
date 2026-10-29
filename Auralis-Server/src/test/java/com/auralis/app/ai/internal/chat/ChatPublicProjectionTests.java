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

        String delta = ChatPublicProjection.publicTextDelta(ChatStreamParser.Component.QUESTION, stem);
        Map<String, Object> part = ChatPublicProjection.blockPart("block-1",
                ChatStreamParser.Component.QUESTION, List.of(stem), "READY", "activity-1");

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
                ChatStreamParser.Component.STEPS, List.of(meta, item), "READY");

        assertThat(part).containsEntry("component", "steps");
        assertThat(ChatPublicProjection.markdown(List.of(part))).contains("### Plan", "- **Check evidence**");
        assertThat(part).doesNotContainKey("privateReference").doesNotContainKey("reference");
    }
}
