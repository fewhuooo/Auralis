package com.auralis.app.ai.internal.chat;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DisplayToolStreamAssemblerTests {
    private static final String RESPONSE = "response-1";
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void recognizesToolBeforeArgumentsAndPreviewsOnlyClosedTopLevelItemsAcrossSingleCharacterDeltas() throws Exception {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        DisplayToolStreamAssembler.CallState call = assembler.accept(progress(0, "call-steps",
                DisplayToolRegistry.RENDER_STEPS, null));

        assertThat(previews).singleElement().satisfies(preview -> assertThat(preview.kind())
                .isEqualTo(DisplayToolStreamAssembler.Kind.START));
        Map<String, Object> firstItem = new LinkedHashMap<>();
        firstItem.put("title", "第一步");
        firstItem.put("description", "文字 \"带引号\"");
        Map<String, Object> secondItem = Map.of("title", "第二步");
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("title", "流程 \"先解析\"🙂");
        root.put("description", "含 { 嵌套样例 }");
        root.put("items", List.of(firstItem, secondItem));
        String arguments = mapper.writeValueAsString(root);
        int secondItemBoundary = arguments.indexOf("},{\"title\":\"第二步\"");
        String beforeFirstItemClose = arguments.substring(0, secondItemBoundary);
        for (int i = 0; i < beforeFirstItemClose.length(); i++) {
            assembler.accept(progress(0, "call-steps", DisplayToolRegistry.RENDER_STEPS,
                    beforeFirstItemClose.substring(i, i + 1)));
        }

        assertThat(itemRows(call.previewRows())).isEmpty();
        for (int i = beforeFirstItemClose.length(); i < arguments.length(); i++) {
            assembler.accept(progress(0, "call-steps", DisplayToolRegistry.RENDER_STEPS,
                    arguments.substring(i, i + 1)));
        }

        assertThat(call.rootClosed()).isTrue();
        assertThat(call.arguments()).isEqualTo(arguments);
        assertThat(itemRows(call.previewRows())).hasSize(2)
                .extracting(row -> row.get("title")).containsExactly("第一步", "第二步");
        assertThat(call.previewRows()).anySatisfy(row -> assertThat(row).containsEntry("title", "流程 \"先解析\"🙂"));
    }

    @Test
    void preservesUnicodeEscapesAndNestedTextAcrossDeterministicRandomSplits() throws Exception {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        Map<String, Object> firstEntry = Map.of("label", "甲", "text", "含转义 \"引号\" 与🙂");
        Map<String, Object> secondEntry = Map.of("label", "乙", "text", "嵌套数组 [x,y]");
        Map<String, Object> dimension = new LinkedHashMap<>();
        dimension.put("title", "方法 A");
        dimension.put("entries", List.of(firstEntry, secondEntry));
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("title", "比较");
        root.put("items", List.of(dimension));
        String arguments = mapper.writeValueAsString(root);
        DisplayToolStreamAssembler.CallState call = feedRandomChunks(assembler, 1, "compare-call",
                DisplayToolRegistry.RENDER_COMPARE, arguments);

        assertThat(call.rootClosed()).isTrue();
        assertThat(call.arguments()).isEqualTo(arguments);
        assertThat(itemRows(call.previewRows())).singleElement().satisfies(row -> {
            assertThat(row).containsEntry("title", "方法 A");
            assertThat(row.get("entries")).isEqualTo(List.of(Map.of("label", "甲", "text", "含转义 \"引号\" 与🙂"),
                    Map.of("label", "乙", "text", "嵌套数组 [x,y]")));
        });
    }

    @Test
    void replaysArgumentsThatArriveBeforeTheRecognizedToolNameExactlyOnce() {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        String arguments = "{\"title\":\"Steps\",\"items\":[{\"title\":\"One\"}]}";
        DisplayToolStreamAssembler.CallState call = assembler.accept(progress(0, "call-late-name", null, arguments));
        assertThat(previews).isEmpty();
        assembler.accept(progress(0, "call-late-name", DisplayToolRegistry.RENDER_STEPS, null));

        assertThat(call.name()).isEqualTo(DisplayToolRegistry.RENDER_STEPS);
        assertThat(call.arguments()).isEqualTo(arguments);
        assertThat(call.rootClosed()).isTrue();
        assertThat(previews).extracting(DisplayToolStreamAssembler.Preview::kind)
                .containsExactly(DisplayToolStreamAssembler.Kind.START,
                        DisplayToolStreamAssembler.Kind.ROW, DisplayToolStreamAssembler.Kind.ROW);
        assertThat(call.previewRows()).hasSize(2);
        assertThat(itemRows(call.previewRows())).singleElement().satisfies(row -> assertThat(row)
                .containsEntry("title", "One"));
        assertThat(new DisplayToolPayloadValidator(mapper).validate(call.name(), call.arguments()).rows()).hasSize(2);
    }

    @Test
    void keepsInterleavedProviderIndexesIsolated() {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        DisplayToolStreamAssembler.CallState steps = assembler.accept(progress(0, "call-0",
                DisplayToolRegistry.RENDER_STEPS, "{\"title\":\"Steps\",\"items\":["));
        DisplayToolStreamAssembler.CallState quiz = assembler.accept(progress(1, "call-1",
                DisplayToolRegistry.RENDER_QUIZ, "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":[{\"key\":\"A\""));
        assertThat(quiz.previewRows()).noneSatisfy(row -> assertThat(row).containsEntry("type", "option"));
        assembler.accept(progress(1, "call-1", DisplayToolRegistry.RENDER_QUIZ,
                ",\"text\":\"one\"},{\"key\":\"B\",\"text\":\"two\"}] }"));
        assembler.accept(progress(0, "call-0", DisplayToolRegistry.RENDER_STEPS,
                "{\"title\":\"One\"}]}"));

        assertThat(assembler.calls(RESPONSE)).containsExactly(steps, quiz);
        assertThat(steps.component()).isEqualTo(DisplayComponent.STEPS);
        assertThat(quiz.component()).isEqualTo(DisplayComponent.QUIZ);
        assertThat(steps.callId()).isEqualTo("call-0");
        assertThat(quiz.callId()).isEqualTo("call-1");
        assertThat(steps.rootClosed()).isTrue();
        assertThat(quiz.rootClosed()).isTrue();
        assertThat(itemRows(steps.previewRows())).extracting(row -> row.get("title")).containsExactly("One");
        assertThat(quiz.previewRows()).extracting(row -> row.get("type")).contains("stem", "option");
    }

    @Test
    void keepsReferencePrivateAndDoesNotPreviewNestedAnswerFields() {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        String arguments = "{\"question\":\"Choose\",\"questionType\":\"single\",\"options\":["
                + "{\"key\":\"A\",\"text\":\"one\"},{\"key\":\"B\",\"text\":\"two\"}],"
                + "\"reference\":{\"answer\":[\"B\"],\"explanation\":\"private detail\"}}";
        DisplayToolStreamAssembler.CallState call = feedRandomChunks(assembler, 0, "quiz-call",
                DisplayToolRegistry.RENDER_QUIZ, arguments);

        assertThat(call.rootClosed()).isTrue();
        assertThat(call.previewRows()).extracting(row -> row.get("type")).contains("stem", "option");
        assertThat(call.previewRows().toString()).doesNotContain("reference", "private detail", "answer");
        DisplayToolPayloadValidator.ValidatedBlock validated = new DisplayToolPayloadValidator(mapper)
                .validate(DisplayToolRegistry.RENDER_QUIZ, call.arguments());
        assertThat(validated.privateReference()).containsEntry("answer", List.of("B"))
                .containsEntry("explanation", "private detail");
    }

    @Test
    void retainsClosedPreviewRowsForIncompleteArgumentsAndRejectsTheWholeRoot() {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        String partial = "{\"title\":\"Steps\",\"items\":[{\"title\":\"One\"}";
        DisplayToolStreamAssembler.CallState call = feedRandomChunks(assembler, 0, "call-partial",
                DisplayToolRegistry.RENDER_STEPS, partial);

        assertThat(call.rootClosed()).isFalse();
        assertThat(itemRows(call.previewRows())).singleElement().satisfies(row -> assertThat(row)
                .containsEntry("title", "One"));
        assertInvalid(call.name(), call.arguments());
    }

    @Test
    void rejectsAWholePayloadThatDiffersFromItsAlreadyPublishedPreview() {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        DisplayToolStreamAssembler assembler = assembler(4096, previews);
        String arguments = "{\"title\":\"Steps\",\"items\":[{\"title\":\"One\"}],\"unexpected\":true}";
        DisplayToolStreamAssembler.CallState call = feedRandomChunks(assembler, 0, "call-invalid-final",
                DisplayToolRegistry.RENDER_STEPS, arguments);

        assertThat(call.rootClosed()).isTrue();
        assertThat(itemRows(call.previewRows())).hasSize(1);
        assertInvalid(call.name(), call.arguments());
    }

    @Test
    void enforcesUtf8ArgumentCapacityWithoutAppendingOverflowingDelta() {
        List<DisplayToolStreamAssembler.Preview> previews = new ArrayList<>();
        String first = "{\"title\":\"你\"";
        long maxBytes = first.getBytes(StandardCharsets.UTF_8).length;
        DisplayToolStreamAssembler assembler = assembler(maxBytes, previews);
        DisplayToolStreamAssembler.CallState call = assembler.accept(progress(0, "call-large",
                DisplayToolRegistry.RENDER_STEPS, first));
        assembler.accept(progress(0, "call-large", DisplayToolRegistry.RENDER_STEPS,
                ",\"items\":[{\"title\":\"One\"}]}"));

        assertThat(call.oversized()).isTrue();
        assertThat(call.arguments()).isEqualTo(first);
        assertThat(call.rootClosed()).isFalse();
        assertThat(call.arguments().getBytes(StandardCharsets.UTF_8).length).isEqualTo(maxBytes);
    }

    private DisplayToolStreamAssembler assembler(long maxUtf8Bytes,
            List<DisplayToolStreamAssembler.Preview> previews) {
        return new DisplayToolStreamAssembler(mapper, maxUtf8Bytes, previews::add);
    }

    private DisplayToolStreamAssembler.CallState feedRandomChunks(DisplayToolStreamAssembler assembler,
            int index, String callId, String toolName, String arguments) {
        DisplayToolStreamAssembler.CallState call = assembler.accept(progress(index, callId, toolName, null));
        Random random = new Random(91L + index);
        int offset = 0;
        while (offset < arguments.length()) {
            int end = Math.min(arguments.length(), offset + 1 + random.nextInt(7));
            assembler.accept(progress(index, callId, toolName, arguments.substring(offset, end)));
            offset = end;
        }
        return call;
    }

    private static ToolCallProgress progress(int index, String callId, String toolName, String argumentsDelta) {
        return new ToolCallProgress(RESPONSE, index, callId, toolName, argumentsDelta);
    }

    private static List<Map<String, Object>> itemRows(List<Map<String, Object>> rows) {
        return rows.stream().filter(row -> "item".equals(row.get("type"))).toList();
    }

    private void assertInvalid(String tool, String json) {
        assertThatThrownBy(() -> new DisplayToolPayloadValidator(mapper).validate(tool, json))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
    }
}
