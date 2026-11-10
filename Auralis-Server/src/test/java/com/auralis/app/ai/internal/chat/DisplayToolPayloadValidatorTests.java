package com.auralis.app.ai.internal.chat;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DisplayToolPayloadValidatorTests {
    private final DisplayToolPayloadValidator validator = new DisplayToolPayloadValidator(new ObjectMapper());

    @Test
    void validatesEachOfTheSixDisplayToolPayloads() {
        Map<String, String> payloads = validPayloads();

        assertThat(payloads).hasSize(6);
        assertThat(payloads.entrySet()).allSatisfy(entry -> {
            DisplayToolPayloadValidator.ValidatedBlock block = validator.validate(entry.getKey(), entry.getValue());
            assertThat(block.component()).isEqualTo(DisplayToolRegistry.component(entry.getKey()));
            assertThat(block.rows()).isNotEmpty();
        });
    }

    @Test
    void registryTreatsIncompleteToolNamesAsUnrecognizedDuringProgress() {
        assertThat(DisplayToolRegistry.isDisplay(null)).isFalse();
        assertThat(DisplayToolRegistry.isKnown(null)).isFalse();
        assertThat(DisplayToolRegistry.component(null)).isNull();
    }

    @Test
    void rejectsMissingRequiredFieldsForEverySchema() {
        Map<String, String> missingRequired = Map.of(
                DisplayToolRegistry.RENDER_STEPS, "{\"items\":[{\"title\":\"One\"}]}",
                DisplayToolRegistry.RENDER_COMPARE, "{\"items\":[{\"title\":\"Dimension\",\"entries\":[{\"label\":\"A\",\"text\":\"a\"},{\"label\":\"B\",\"text\":\"b\"}]}]}",
                DisplayToolRegistry.RENDER_ROADMAP, "{\"title\":\"Roadmap\",\"items\":[{}]}",
                DisplayToolRegistry.RENDER_CHART, "{\"title\":\"Chart\",\"items\":[{\"label\":\"A\",\"value\":1}]}",
                DisplayToolRegistry.RENDER_QUIZ, "{\"question\":\"Question?\",\"options\":[{\"key\":\"A\",\"text\":\"a\"},{\"key\":\"B\",\"text\":\"b\"}]}",
                DisplayToolRegistry.RENDER_QUESTION, "{\"placeholder\":\"Answer\"}");

        assertThat(missingRequired.entrySet()).allSatisfy(entry -> assertInvalid(entry.getKey(), entry.getValue()));
    }

    @Test
    void rejectsUnknownFieldsAtEachToolRootAndInsideNestedCompareEntries() {
        Map<String, String> withUnknownRoot = new LinkedHashMap<>();
        validPayloads().forEach((tool, json) -> withUnknownRoot.put(tool, addUnknownRootField(json)));

        assertThat(withUnknownRoot.entrySet()).allSatisfy(entry -> assertInvalid(entry.getKey(), entry.getValue()));
        assertInvalid(DisplayToolRegistry.RENDER_COMPARE,
                "{\"title\":\"Compare\",\"items\":[{\"title\":\"Dimension\",\"entries\":["
                        + "{\"label\":\"A\",\"text\":\"a\",\"extra\":true},{\"label\":\"B\",\"text\":\"b\"}]}]}");
    }

    @Test
    void rejectsDuplicateJsonKeysAtRootAndInNestedOptionObjects() {
        assertInvalid(DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"First\",\"title\":\"Second\",\"items\":[{\"title\":\"One\"}]}");
        assertInvalid(DisplayToolRegistry.RENDER_QUIZ,
                "{\"question\":\"Q?\",\"questionType\":\"single\",\"options\":["
                        + "{\"key\":\"A\",\"key\":\"B\",\"text\":\"a\"},{\"key\":\"C\",\"text\":\"c\"}]}");
    }

    @Test
    void quizReferenceIsOptionalAndStaysOutOfPublicRowsWhenPresent() {
        DisplayToolPayloadValidator.ValidatedBlock withoutReference = validator.validate(
                DisplayToolRegistry.RENDER_QUIZ, validPayloads().get(DisplayToolRegistry.RENDER_QUIZ));
        DisplayToolPayloadValidator.ValidatedBlock withReference = validator.validate(DisplayToolRegistry.RENDER_QUIZ,
                "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                        + "{\"key\":\"A\",\"text\":\"one\"},{\"key\":\"B\",\"text\":\"two\"}],"
                        + "\"reference\":{\"answer\":[\"B\"],\"explanation\":\"private\"}}");

        assertThat(withoutReference.privateReference()).isNull();
        assertThat(withReference.privateReference()).containsEntry("answer", List.of("B"))
                .containsEntry("explanation", "private");
        assertThat(withReference.rows()).noneSatisfy(row -> assertThat(row).containsKey("reference"));
    }

    @Test
    void validatesCompareEntriesAndChartFinitePositiveProportionTotals() {
        DisplayToolPayloadValidator.ValidatedBlock compare = validator.validate(DisplayToolRegistry.RENDER_COMPARE,
                "{\"title\":\"Compare\",\"items\":[{\"title\":\"Cost\",\"entries\":["
                        + "{\"label\":\"A\",\"text\":\"low\"},{\"label\":\"B\",\"text\":\"high\"}]}]}");

        assertThat(compare.rows().get(1)).containsEntry("title", "Cost")
                .containsEntry("entries", List.of(Map.of("label", "A", "text", "low"),
                        Map.of("label", "B", "text", "high")));
        assertInvalid(DisplayToolRegistry.RENDER_COMPARE,
                "{\"title\":\"Compare\",\"items\":[{\"title\":\"Cost\",\"entries\":["
                        + "{\"label\":\"A\",\"text\":\"low\"}]}]}");
        assertInvalid(DisplayToolRegistry.RENDER_CHART,
                "{\"title\":\"Chart\",\"chartType\":\"proportion\",\"items\":["
                        + "{\"label\":\"A\",\"value\":0}]}");
        assertInvalid(DisplayToolRegistry.RENDER_CHART,
                "{\"title\":\"Chart\",\"chartType\":\"bar\",\"items\":["
                        + "{\"label\":\"A\",\"value\":1e309}]}");
    }

    @Test
    void rejectsDuplicateQuizOptionKeysAndInvalidReferenceKeys() {
        assertInvalid(DisplayToolRegistry.RENDER_QUIZ,
                "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                        + "{\"key\":\"A\",\"text\":\"one\"},{\"key\":\"A\",\"text\":\"two\"}]}");
        assertInvalid(DisplayToolRegistry.RENDER_QUIZ,
                "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                        + "{\"key\":\"A\",\"text\":\"one\"},{\"key\":\"B\",\"text\":\"two\"}],"
                        + "\"reference\":{\"answer\":[\"missing\"]}}");
    }

    @Test
    void rejectsBlankOptionalReferenceExplanationsForQuizAndQuestion() {
        assertInvalid(DisplayToolRegistry.RENDER_QUIZ,
                "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                        + "{\"key\":\"A\",\"text\":\"one\"},{\"key\":\"B\",\"text\":\"two\"}],"
                        + "\"reference\":{\"answer\":[\"A\"],\"explanation\":\" \"}}");
        assertInvalid(DisplayToolRegistry.RENDER_QUESTION,
                "{\"question\":\"Explain\",\"reference\":{\"answer\":\"answer\",\"explanation\":\"\"}}");
    }

    @Test
    void rejectsUnknownToolsAndTrailingJsonTokens() {
        assertInvalid("render_unknown", "{\"title\":\"x\"}");
        assertInvalid(DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"Plan\",\"items\":[{\"title\":\"One\"}]} {} ");
    }

    @Test
    void distinguishesRepairableSchemaRejectionsFromJsonSyntaxFailures() {
        assertThatThrownBy(() -> validator.validate(DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"Flow\"}"))
                .isInstanceOfSatisfying(DisplayToolPayloadValidator.ValidationFailure.class, failure -> {
                    assertThat(failure.repairable()).isTrue();
                    assertThat(failure.fieldPath()).isEqualTo("$.items");
                    assertThat(failure.missingFields()).containsExactly("items");
                });
        assertThatThrownBy(() -> validator.validate(DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"Flow\","))
                .isInstanceOfSatisfying(DisplayToolPayloadValidator.ValidationFailure.class, failure -> {
                    assertThat(failure.repairable()).isFalse();
                    assertThat(failure.fieldPath()).isEqualTo("$");
                });
        assertThatThrownBy(() -> validator.validate(DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"Flow\",\"items\":[{\"title\":9}]}"))
                .isInstanceOfSatisfying(DisplayToolPayloadValidator.ValidationFailure.class, failure -> {
                    assertThat(failure.repairable()).isTrue();
                    assertThat(failure.fieldPath()).isEqualTo("$.items[].title");
                    assertThat(failure.missingFields()).isEmpty();
                });
    }

    private void assertInvalid(String tool, String json) {
        assertThatThrownBy(() -> validator.validate(tool, json))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("CHAT_TOOL_ARGUMENT_INVALID"));
    }

    private static String addUnknownRootField(String json) {
        return json.substring(0, json.length() - 1) + ",\"unexpected\":true}";
    }

    private static Map<String, String> validPayloads() {
        Map<String, String> payloads = new LinkedHashMap<>();
        payloads.put(DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"Steps\",\"items\":[{\"title\":\"One\",\"description\":\"First\"}]}");
        payloads.put(DisplayToolRegistry.RENDER_COMPARE,
                "{\"title\":\"Compare\",\"items\":[{\"title\":\"Cost\",\"entries\":["
                        + "{\"label\":\"A\",\"text\":\"low\"},{\"label\":\"B\",\"text\":\"high\"}]}]}");
        payloads.put(DisplayToolRegistry.RENDER_ROADMAP,
                "{\"title\":\"Roadmap\",\"items\":[{\"title\":\"Learn\",\"tag\":\"now\",\"current\":true}]}");
        payloads.put(DisplayToolRegistry.RENDER_CHART,
                "{\"title\":\"Chart\",\"chartType\":\"proportion\",\"unit\":\"%\",\"items\":["
                        + "{\"label\":\"A\",\"value\":2},{\"label\":\"B\",\"value\":3}]}");
        payloads.put(DisplayToolRegistry.RENDER_QUIZ,
                "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                        + "{\"key\":\"A\",\"text\":\"one\"},{\"key\":\"B\",\"text\":\"two\"}]}");
        payloads.put(DisplayToolRegistry.RENDER_QUESTION,
                "{\"question\":\"Explain\",\"placeholder\":\"Your answer\",\"reference\":{\"points\":[\"cause\"]}}");
        return payloads;
    }
}
