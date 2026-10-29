package com.auralis.app.ai;

import com.auralis.app.ai.internal.chat.ChatStreamParser;
import com.auralis.app.ai.internal.chat.ChatStreamParser.BlockCompleted;
import com.auralis.app.ai.internal.chat.ChatStreamParser.BlockError;
import com.auralis.app.ai.internal.chat.ChatStreamParser.BlockItem;
import com.auralis.app.ai.internal.chat.ChatStreamParser.BlockStarted;
import com.auralis.app.ai.internal.chat.ChatStreamParser.Component;
import com.auralis.app.ai.internal.chat.ChatStreamParser.ErrorCode;
import com.auralis.app.ai.internal.chat.ChatStreamParser.Event;
import com.auralis.app.ai.internal.chat.ChatStreamParser.Limits;
import com.auralis.app.ai.internal.chat.ChatStreamParser.PrivateReference;
import com.auralis.app.ai.internal.chat.ChatStreamParser.QuestionReference;
import com.auralis.app.ai.internal.chat.ChatStreamParser.QuizReference;
import com.auralis.app.ai.internal.chat.ChatStreamParser.TextDelta;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatStreamParserTests {

    private static final Limits DEFAULT_LIMITS = new Limits(8_192, 32_768, 128, 128);

    @Test
    void emitsOrdinaryMarkdownImmediatelyAndBuffersOnlyPossibleControlPrefixes() {
        ChatStreamParser parser = parser(new ArrayList<>());

        List<Event> ordinary = parser.feed("ordinary Markdown\n");
        assertThat(ordinary).containsExactly(new TextDelta(1, "ordinary Markdown\n"));

        assertThat(parser.feed(":")).isEmpty();
        assertThat(parser.feed("x")).containsExactly(new TextDelta(2, ":x"));
        assertThat(parser.finish()).isEmpty();
    }

    @Test
    void parsesStepsAtEveryNetworkSplitAndProjectsOnlyAllowlistedFields() {
        String source = "before\r\n"
                + ":::auralis-steps\r\n"
                + "{\"type\":\"meta\",\"title\":\"Flow\",\"description\":\"Intro\",\"clientId\":\"model-id\"}\r\n"
                + "{\"type\":\"item\",\"title\":\"Read\",\"description\":\"Source\",\"eventId\":\"fake-id\",\"script\":\"ignored\"}\r\n"
                + ":::\r\n"
                + "after";

        for (int split = 0; split <= source.length(); split++) {
            List<PrivateReference> references = new ArrayList<>();
            ChatStreamParser parser = parser(references);
            List<Event> events = new ArrayList<>();
            events.addAll(parser.feed(source.substring(0, split)));
            events.addAll(parser.feed(source.substring(split)));
            events.addAll(parser.finish());

            assertThat(events).filteredOn(event -> !(event instanceof TextDelta))
                    .extracting(event -> event.getClass().getSimpleName())
                    .containsExactly("BlockStarted", "BlockItem", "BlockItem", "BlockCompleted");
            assertThat(events).extracting(Event::sequence).isSorted();
            assertThat(events.stream().filter(TextDelta.class::isInstance).map(TextDelta.class::cast)
                    .map(TextDelta::text).reduce("", String::concat)).isEqualTo("before\r\nafter");
            BlockStarted started = events.stream().filter(BlockStarted.class::isInstance)
                    .map(BlockStarted.class::cast).findFirst().orElseThrow();
            assertThat(started.component()).isEqualTo(Component.STEPS);
            BlockCompleted completed = events.stream().filter(BlockCompleted.class::isInstance)
                    .map(BlockCompleted.class::cast).findFirst().orElseThrow();
            assertThat(completed.rows()).containsExactly(
                    Map.of("type", "meta", "title", "Flow", "description", "Intro"),
                    Map.of("type", "item", "title", "Read", "description", "Source"));
            assertThat(references).isEmpty();
        }
    }

    @Test
    void keepsQuizReferencePrivateAndRequiresValidAnswerKeys() {
        List<PrivateReference> references = new ArrayList<>();
        String source = ":::auralis-quiz\n"
                + "{\"type\":\"stem\",\"questionType\":\"single\",\"question\":\"Which one?\",\"reference\":\"not-public\"}\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"First\",\"itemId\":\"ignored\"}\n"
                + "{\"type\":\"option\",\"key\":\"B\",\"text\":\"Second\"}\n"
                + "{\"type\":\"reference\",\"answer\":[\"B\"],\"explanation\":\"private explanation\",\"correct\":true}\n"
                + ":::\n";

        List<Event> events = parse(source, parser(references));

        assertThat(events).extracting(event -> event.getClass().getSimpleName())
                .containsExactly("BlockStarted", "BlockItem", "BlockItem", "BlockItem", "BlockCompleted");
        BlockCompleted completed = (BlockCompleted) events.getLast();
        assertThat(completed.component()).isEqualTo(Component.QUIZ);
        assertThat(completed.rows()).hasSize(3);
        assertThat(completed.rows().toString()).doesNotContain("private explanation", "not-public", "correct");
        assertThat(references).singleElement().isInstanceOf(QuizReference.class);
        QuizReference reference = (QuizReference) references.getFirst();
        assertThat(reference.answerKeys()).containsExactly("B");
        assertThat(reference.explanation()).contains("private explanation");
        assertThat(events).noneMatch(event -> event instanceof BlockError);
    }

    @Test
    void parsesQuestionReferenceAsPrivateOptionalData() {
        List<PrivateReference> references = new ArrayList<>();
        String source = ":::auralis-question\n"
                + "{\"type\":\"stem\",\"question\":\"Explain the flow\",\"placeholder\":\"Your answer\",\"private\":\"x\"}\n"
                + "{\"type\":\"reference\",\"points\":[\"first point\",\"second point\"],\"explanation\":\"internal\"}\n"
                + ":::\n";

        List<Event> events = parse(source, parser(references));

        assertThat(events).extracting(event -> event.getClass().getSimpleName())
                .containsExactly("BlockStarted", "BlockItem", "BlockCompleted");
        assertThat(((BlockCompleted) events.getLast()).rows()).containsExactly(
                Map.of("type", "stem", "question", "Explain the flow", "placeholder", "Your answer"));
        assertThat(references).singleElement().isInstanceOf(QuestionReference.class);
        QuestionReference reference = (QuestionReference) references.getFirst();
        assertThat(reference.points()).containsExactly("first point", "second point");
        assertThat(reference.answer()).isEmpty();
        assertThat(reference.explanation()).contains("internal");

        List<PrivateReference> noReference = new ArrayList<>();
        List<Event> optional = parse(":::auralis-question\n"
                + "{\"type\":\"stem\",\"question\":\"Open prompt\"}\n:::\n", parser(noReference));
        assertThat(optional).anyMatch(BlockCompleted.class::isInstance);
        assertThat(noReference).isEmpty();
    }

    @Test
    void validatesFrozenDescriptiveSchemasForCompareRoadmapAndChart() {
        String source = ":::auralis-compare\n"
                + "{\"type\":\"meta\",\"title\":\"Compare\"}\n"
                + "{\"type\":\"item\",\"title\":\"Option A\",\"description\":\"First\",\"left\":\"ignored\"}\n:::\n"
                + ":::auralis-roadmap\n"
                + "{\"type\":\"meta\",\"title\":\"Route\",\"description\":\"Plan\"}\n"
                + "{\"type\":\"item\",\"title\":\"Start\",\"tag\":\"now\",\"current\":true,\"color\":\"red\"}\n:::\n"
                + ":::auralis-chart\n"
                + "{\"type\":\"meta\",\"title\":\"Share\",\"chartType\":\"proportion\",\"unit\":\"%\",\"series\":[] }\n"
                + "{\"type\":\"item\",\"label\":\"A\",\"value\":0.25,\"color\":\"red\"}\n"
                + "{\"type\":\"item\",\"label\":\"B\",\"value\":0.75}\n:::\n";

        List<Event> events = parse(source, parser(new ArrayList<>()));

        List<BlockCompleted> completed = events.stream()
                .filter(BlockCompleted.class::isInstance)
                .map(BlockCompleted.class::cast)
                .toList();
        assertThat(completed).extracting(BlockCompleted::component)
                .containsExactly(Component.COMPARE, Component.ROADMAP, Component.CHART);
        assertThat(completed.get(0).rows().get(1)).containsOnlyKeys("type", "title", "description");
        assertThat(completed.get(1).rows().get(1))
                .containsEntry("tag", "now")
                .containsEntry("current", true)
                .doesNotContainKey("color");
        assertThat(completed.get(2).rows().get(0))
                .containsEntry("chartType", "proportion")
                .containsEntry("unit", "%")
                .doesNotContainKey("series");
        assertThat(completed.get(2).rows().get(1).get("value")).isEqualTo(new java.math.BigDecimal("0.25"));
    }

    @Test
    void rejectsMalformedQuizAndQuestionWithoutCompletingThem() {
        assertInvalidBlock(":::auralis-quiz\n"
                + "{\"type\":\"stem\",\"questionType\":\"single\",\"question\":\"Pick\"}\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"A\"}\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"duplicate\"}\n:::\n",
                ErrorCode.INVALID_ROW);
        assertInvalidBlock(":::auralis-quiz\n"
                + "{\"type\":\"stem\",\"questionType\":\"single\",\"question\":\"Pick\"}\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"A\"}\n"
                + "{\"type\":\"option\",\"key\":\"B\",\"text\":\"B\"}\n"
                + "{\"type\":\"reference\",\"answer\":[\"C\"]}\n:::\n",
                ErrorCode.INVALID_REFERENCE);
        assertInvalidBlock(":::auralis-quiz\n"
                + "{\"type\":\"stem\",\"questionType\":\"single\",\"question\":\"Pick\"}\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"A\"}\n"
                + "{\"type\":\"option\",\"key\":\"B\",\"text\":\"B\"}\n:::\n",
                ErrorCode.MISSING_REQUIRED_CONTENT);
        assertInvalidBlock(":::auralis-question\n"
                + "{\"type\":\"stem\",\"question\":\"  \"}\n:::\n",
                ErrorCode.INVALID_ROW);
    }

    @Test
    void rejectsQuizOptionsThatAppearBeforeTheStem() {
        assertInvalidBlock(":::auralis-quiz\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"First\"}\n"
                + "{\"type\":\"stem\",\"questionType\":\"single\",\"question\":\"Pick\"}\n"
                + "{\"type\":\"option\",\"key\":\"B\",\"text\":\"Second\"}\n"
                + "{\"type\":\"reference\",\"answer\":[\"A\"]}\n:::\n",
                ErrorCode.UNEXPECTED_ROW);
    }

    @Test
    void reportsBadJsonThenRecoversPlainProseWithoutLeakingRawBuffers() {
        String malformed = "{\"type\":}\n";
        String source = ":::auralis-steps\n"
                + "{\"type\":\"meta\",\"title\":\"Broken\"}\n"
                + malformed
                + "Recovered prose\n"
                + ":::auralis-steps\n"
                + "{\"type\":\"meta\",\"title\":\"Good\"}\n"
                + "{\"type\":\"item\",\"title\":\"One\"}\n:::\n";

        List<Event> events = parse(source, parser(new ArrayList<>()));

        assertThat(events).filteredOn(BlockError.class::isInstance)
                .extracting(event -> ((BlockError) event).code())
                .containsExactly(ErrorCode.INVALID_JSON);
        assertThat(events).filteredOn(BlockCompleted.class::isInstance).hasSize(1);
        assertThat(events).filteredOn(TextDelta.class::isInstance)
                .extracting(event -> ((TextDelta) event).text())
                .contains("Recovered prose\n");
        assertThat(events.toString()).doesNotContain(malformed.trim());
        assertSequencesIncrease(events);
    }

    @Test
    void treatsAuralisMarkersInsideBacktickAndTildeFencesAsMarkdownAndMatchesFenceLength() {
        String source = "```md\r\n"
                + ":::auralis-steps\r\n"
                + "```\r\n"
                + "~~~~text\n"
                + ":::auralis-question\n"
                + "~~~\n"
                + ":::auralis-quiz\n"
                + "~~~~~\n"
                + ":::auralis-steps\n"
                + "{\"type\":\"meta\",\"title\":\"Outside\"}\n"
                + "{\"type\":\"item\",\"title\":\"Visible\"}\n:::\n";

        List<Event> events = parse(source, parser(new ArrayList<>()));

        assertThat(events).filteredOn(BlockStarted.class::isInstance)
                .extracting(event -> ((BlockStarted) event).component())
                .containsExactly(Component.STEPS);
        assertThat(events).filteredOn(BlockCompleted.class::isInstance).hasSize(1);
        String markdown = events.stream()
                .filter(TextDelta.class::isInstance)
                .map(TextDelta.class::cast)
                .map(TextDelta::text)
                .reduce("", String::concat);
        assertThat(markdown).contains(":::auralis-steps\r\n", ":::auralis-question\n", "~~~\n", ":::auralis-quiz\n");
    }

    @Test
    void preservesFenceInfoStringsAndMarkersInsideCodeAtEveryNetworkSplit() {
        String source = "```json\r\n"
                + ":::auralis-steps\r\n"
                + "~~~\r\n"
                + ":::auralis-quiz\r\n"
                + "````\r\n"
                + ":::auralis-steps\r\n"
                + "{\"type\":\"meta\",\"title\":\"Outside\"}\r\n"
                + "{\"type\":\"item\",\"title\":\"Visible\"}\r\n:::\r\n";

        for (int split = 0; split <= source.length(); split++) {
            ChatStreamParser resumed = parser(new ArrayList<>());
            List<Event> events = new ArrayList<>(resumed.feed(source.substring(0, split)));
            events.addAll(resumed.feed(source.substring(split)));
            events.addAll(resumed.finish());

            assertThat(events).filteredOn(BlockStarted.class::isInstance)
                    .extracting(event -> ((BlockStarted) event).component())
                    .containsExactly(Component.STEPS);
            assertThat(events).filteredOn(BlockCompleted.class::isInstance).hasSize(1);
            String markdown = events.stream()
                    .filter(TextDelta.class::isInstance)
                    .map(TextDelta.class::cast)
                    .map(TextDelta::text)
                    .reduce("", String::concat);
            assertThat(markdown).contains(":::auralis-steps\r\n", ":::auralis-quiz\r\n", "~~~\r\n");
        }
    }

    @Test
    void doesNotCloseAComponentOnMarkersInsideJsonStrings() {
        List<Event> events = parse(":::auralis-steps\n"
                + "{\"type\":\"meta\",\"title\":\"A ::: marker\"}\n"
                + "{\"type\":\"item\",\"title\":\"Literal :::auralis-question\",\"description\":\"::: is data\"}\n"
                + ":::\n", parser(new ArrayList<>()));

        assertThat(events).filteredOn(BlockCompleted.class::isInstance).hasSize(1);
        assertThat(events).noneMatch(BlockError.class::isInstance);
    }

    @Test
    void doesNotCompleteUnterminatedBlocksOrPersistTheirPrivateReference() {
        List<PrivateReference> references = new ArrayList<>();
        String source = ":::auralis-quiz\n"
                + "{\"type\":\"stem\",\"questionType\":\"single\",\"question\":\"Pick\"}\n"
                + "{\"type\":\"option\",\"key\":\"A\",\"text\":\"A\"}\n"
                + "{\"type\":\"option\",\"key\":\"B\",\"text\":\"B\"}\n"
                + "{\"type\":\"reference\",\"answer\":[\"A\"]}\n";

        List<Event> events = parse(source, parser(references));

        assertThat(events).filteredOn(BlockError.class::isInstance)
                .extracting(event -> ((BlockError) event).code())
                .containsExactly(ErrorCode.MISSING_END_MARKER);
        assertThat(events).noneMatch(BlockCompleted.class::isInstance);
        assertThat(references).isEmpty();
    }

    @Test
    void enforcesInjectedLineBlockAndRowLimitsWithoutPublishingRejectedJson() {
        assertLimitError(":::auralis-steps\n"
                        + "{\"type\":\"meta\",\"title\":\"a very long title\"}\n:::\n",
                new Limits(16, 8_192, 8, 128));
        assertLimitError(":::auralis-steps\n"
                        + "{\"type\":\"meta\",\"title\":\"M\"}\n"
                        + "{\"type\":\"item\",\"title\":\"one\"}\n:::\n",
                new Limits(8_192, 40, 8, 128));
        assertLimitError(":::auralis-steps\n"
                        + "{\"type\":\"meta\",\"title\":\"M\"}\n"
                        + "{\"type\":\"item\",\"title\":\"one\"}\n:::\n",
                new Limits(8_192, 32_768, 1, 128));
    }

    @Test
    void proportionChartRequiresPositiveTotalAndRejectsUnsupportedRows() {
        assertInvalidBlock(":::auralis-chart\n"
                + "{\"type\":\"meta\",\"title\":\"Share\",\"chartType\":\"proportion\"}\n"
                + "{\"type\":\"item\",\"label\":\"A\",\"value\":0}\n:::\n",
                ErrorCode.INVALID_COMPONENT);
        assertInvalidBlock(":::auralis-chart\n"
                + "{\"type\":\"meta\",\"title\":\"Chart\",\"chartType\":\"bar\"}\n"
                + "{\"type\":\"series\",\"name\":\"unsupported\",\"points\":[]}\n:::\n",
                ErrorCode.UNEXPECTED_ROW);
    }

    @Test
    void resetDropsPartialStateAndFinishIsIdempotent() {
        ChatStreamParser parser = parser(new ArrayList<>());
        assertThat(parser.feed(":::auralis-st")).isEmpty();

        parser.reset();
        assertThat(parser.feed("Ready")).containsExactly(new TextDelta(1, "Ready"));
        assertThat(parser.finish()).isEmpty();
        assertThat(parser.finish()).isEmpty();
        assertThatThrownBy(() -> parser.feed("later")).isInstanceOf(IllegalStateException.class);
    }

    private static void assertInvalidBlock(String source, ErrorCode expected) {
        List<Event> events = parse(source, parser(new ArrayList<>()));
        assertThat(events).filteredOn(BlockError.class::isInstance)
                .extracting(event -> ((BlockError) event).code())
                .contains(expected);
        assertThat(events).noneMatch(BlockCompleted.class::isInstance);
    }

    private static void assertLimitError(String source, Limits limits) {
        List<Event> events = parse(source, parser(new ArrayList<>(), limits));
        assertThat(events).filteredOn(BlockError.class::isInstance)
                .extracting(event -> ((BlockError) event).code())
                .contains(ErrorCode.RESOURCE_LIMIT_EXCEEDED);
        assertThat(events).noneMatch(BlockCompleted.class::isInstance);
        assertThat(events.toString()).doesNotContain("a very long title");
    }

    private static void assertSequencesIncrease(List<Event> events) {
        assertThat(events.stream().map(Event::sequence).toList())
                .isSorted()
                .doesNotHaveDuplicates();
    }

    private static List<Event> parse(String source, ChatStreamParser parser) {
        List<Event> events = new ArrayList<>(parser.feed(source));
        events.addAll(parser.finish());
        return events;
    }

    private static ChatStreamParser parser(List<PrivateReference> references) {
        return parser(references, DEFAULT_LIMITS);
    }

    private static ChatStreamParser parser(List<PrivateReference> references, Limits limits) {
        AtomicInteger ids = new AtomicInteger();
        AtomicLong sequences = new AtomicLong();
        return new ChatStreamParser(new ObjectMapper(), limits,
                () -> "block-" + ids.incrementAndGet(), sequences::incrementAndGet, references::add);
    }
}
