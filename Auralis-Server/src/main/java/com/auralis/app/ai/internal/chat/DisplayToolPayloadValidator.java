package com.auralis.app.ai.internal.chat;

import com.auralis.app.shared.error.DomainException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Strict validator and public projection for local display tool arguments. */
public final class DisplayToolPayloadValidator {
    private final ObjectMapper mapper;

    public DisplayToolPayloadValidator(ObjectMapper mapper) {
        this.mapper = java.util.Objects.requireNonNull(mapper);
    }

    public ValidatedBlock validate(String toolName, String json) {
        DisplayComponent component = DisplayToolRegistry.component(toolName);
        if (component == null) throw rejected(false, "$", List.of());
        JsonNode root;
        try {
            root = mapper.reader()
                    .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(json);
        } catch (Exception exception) {
            throw rejected(false, "$", List.of());
        }
        try {
            object(root, "$", List.of());
            List<Map<String, Object>> rows = new ArrayList<>();
            Map<String, Object> reference = null;
            switch (component) {
                case STEPS, COMPARE, ROADMAP, CHART -> {
                    String title = requiredText(root, "title");
                    Map<String, Object> meta = new LinkedHashMap<>();
                    meta.put("type", "meta"); meta.put("title", title);
                    optionalText(root, "description", meta);
                    if (component == DisplayComponent.CHART) {
                        String chartType = requiredText(root, "chartType");
                        if (!chartType.equals("bar") && !chartType.equals("proportion")) throw invalid();
                        meta.put("chartType", chartType);
                        optionalText(root, "unit", meta);
                    }
                    exactFields(root, component == DisplayComponent.CHART
                            ? Set.of("title", "description", "chartType", "unit", "items")
                            : Set.of("title", "description", "items"));
                    rows.add(Map.copyOf(meta));
                    JsonNode items = requiredArray(root, "items", 1);
                    BigDecimal chartTotal = BigDecimal.ZERO;
                    for (JsonNode raw : items) {
                        object(raw);
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("type", "item");
                        switch (component) {
                            case STEPS -> {
                                exactFields(raw, Set.of("title", "description"), "$.items[]");
                                row.put("title", requiredText(raw, "title", "$.items[]"));
                                optionalText(raw, "description", row, "$.items[]");
                            }
                            case ROADMAP -> {
                                exactFields(raw, Set.of("title", "description", "tag", "current"), "$.items[]");
                                row.put("title", requiredText(raw, "title", "$.items[]"));
                                optionalText(raw, "description", row, "$.items[]");
                                optionalText(raw, "tag", row, "$.items[]");
                                if (raw.has("current")) { if (!raw.get("current").isBoolean()) throw invalid(); row.put("current", raw.get("current").booleanValue()); }
                            }
                            case COMPARE -> {
                                exactFields(raw, Set.of("title", "entries"), "$.items[]");
                                row.put("title", requiredText(raw, "title", "$.items[]"));
                                JsonNode entries = requiredArray(raw, "entries", 2, "$.items[]");
                                List<Map<String, Object>> projected = new ArrayList<>();
                                for (JsonNode entry : entries) {
                                    object(entry); exactFields(entry, Set.of("label", "text"), "$.items[].entries[]");
                                    projected.add(Map.of("label", requiredText(entry, "label", "$.items[].entries[]"),
                                            "text", requiredText(entry, "text", "$.items[].entries[]")));
                                }
                                row.put("entries", List.copyOf(projected));
                            }
                            case CHART -> {
                                exactFields(raw, Set.of("label", "value"), "$.items[]");
                                String label = requiredText(raw, "label", "$.items[]");
                                JsonNode value = raw.get("value");
                                if (value == null || !value.isNumber()) throw invalid();
                                BigDecimal number = value.decimalValue();
                                if (number.signum() < 0 || !Double.isFinite(number.doubleValue())) throw invalid();
                                chartTotal = chartTotal.add(number);
                                row.put("label", label); row.put("value", number);
                            }
                            default -> throw invalid();
                        }
                        rows.add(Map.copyOf(row));
                    }
                    if (component == DisplayComponent.CHART && "proportion".equals(root.get("chartType").stringValue())
                            && chartTotal.signum() <= 0) throw invalid();
                }
                case QUIZ -> {
                    exactFields(root, Set.of("question", "questionType", "options", "reference"));
                    String question = requiredText(root, "question");
                    String questionType = requiredText(root, "questionType");
                    if (!questionType.equals("single") && !questionType.equals("multiple")) throw invalid();
                    rows.add(Map.of("type", "stem", "question", question, "questionType", questionType));
                    JsonNode options = requiredArray(root, "options", 2);
                    Set<String> keys = new LinkedHashSet<>();
                    for (JsonNode option : options) {
                        object(option); exactFields(option, Set.of("key", "text"), "$.options[]");
                        String key = requiredText(option, "key", "$.options[]");
                        if (!keys.add(key)) throw invalid();
                        rows.add(Map.of("type", "option", "key", key, "text", requiredText(option, "text", "$.options[]")));
                    }
                    if (root.has("reference")) {
                        JsonNode ref = root.get("reference"); object(ref); exactFields(ref, Set.of("answer", "explanation"));
                        JsonNode answers = requiredArray(ref, "answer", 1);
                        List<String> keysInAnswer = new ArrayList<>();
                        for (JsonNode answer : answers) {
                            if (!answer.isString() || !keys.contains(answer.stringValue()) || keysInAnswer.contains(answer.stringValue())) throw invalid();
                            keysInAnswer.add(answer.stringValue());
                        }
                        if (questionType.equals("single") && keysInAnswer.size() != 1) throw invalid();
                        Map<String, Object> privateRef = new LinkedHashMap<>();
                        privateRef.put("answer", List.copyOf(keysInAnswer)); optionalNonBlankText(ref, "explanation", privateRef);
                        reference = Map.copyOf(privateRef);
                    }
                }
                case QUESTION -> {
                    exactFields(root, Set.of("question", "placeholder", "reference"));
                    String question = requiredText(root, "question");
                    Map<String, Object> stem = new LinkedHashMap<>(); stem.put("type", "stem"); stem.put("question", question);
                    optionalText(root, "placeholder", stem); rows.add(Map.copyOf(stem));
                    if (root.has("reference")) {
                        JsonNode ref = root.get("reference"); object(ref);
                        exactFields(ref, Set.of("points", "answer", "explanation"));
                        boolean points = ref.has("points"), answer = ref.has("answer");
                        if (points == answer) throw invalid();
                        Map<String, Object> privateRef = new LinkedHashMap<>();
                        if (points) {
                            JsonNode values = requiredArray(ref, "points", 1); List<String> list = new ArrayList<>();
                            for (JsonNode value : values) { if (!value.isString() || value.stringValue().isBlank()) throw invalid(); list.add(value.stringValue()); }
                            privateRef.put("points", List.copyOf(list));
                        } else privateRef.put("answer", requiredText(ref, "answer"));
                        optionalNonBlankText(ref, "explanation", privateRef); reference = Map.copyOf(privateRef);
                    }
                }
            }
            return new ValidatedBlock(component, List.copyOf(rows), reference);
        } catch (DomainException exception) {
            throw exception;
        } catch (Exception exception) {
            throw rejected(false, "$", List.of());
        }
    }

    private static void object(JsonNode node) { if (node == null || !node.isObject()) throw invalid("$"); }
    private static void object(JsonNode node, String path, List<String> missingFields) {
        if (node == null || !node.isObject()) throw invalid(path, missingFields);
    }
    private static String requiredText(JsonNode node, String key) {
        return requiredText(node, key, "$");
    }
    private static String requiredText(JsonNode node, String key, String parentPath) {
        JsonNode value = node.get(key);
        String path = parentPath + "." + key;
        if (value == null) throw invalid(path, List.of(key));
        if (!value.isString() || value.stringValue().isBlank()) throw invalid(path);
        return value.stringValue();
    }
    private static void optionalText(JsonNode node, String key, Map<String, Object> target) {
        optionalText(node, key, target, "$");
    }
    private static void optionalText(JsonNode node, String key, Map<String, Object> target, String parentPath) {
        if (node.has(key)) {
            JsonNode value = node.get(key);
            if (!value.isString()) throw invalid(parentPath + "." + key);
            target.put(key, value.stringValue());
        }
    }
    private static void optionalNonBlankText(JsonNode node, String key, Map<String, Object> target) {
        if (node.has(key)) {
            JsonNode value = node.get(key);
            if (!value.isString() || value.stringValue().isBlank()) throw invalid("$." + key);
            target.put(key, value.stringValue());
        }
    }
    private static JsonNode requiredArray(JsonNode node, String key, int minimum) {
        return requiredArray(node, key, minimum, "$");
    }
    private static JsonNode requiredArray(JsonNode node, String key, int minimum, String parentPath) {
        JsonNode array = node.get(key);
        String path = parentPath + "." + key;
        if (array == null) throw invalid(path, List.of(key));
        if (!array.isArray() || array.size() < minimum) throw invalid(path);
        return array;
    }
    private static void exactFields(JsonNode node, Set<String> allowed) {
        exactFields(node, allowed, "$");
    }
    private static void exactFields(JsonNode node, Set<String> allowed, String path) {
        node.properties().forEach(entry -> { if (!allowed.contains(entry.getKey())) throw invalid(path); });
    }
    private static DomainException invalid() {
        return invalid("$");
    }
    private static ValidationFailure invalid(String path) {
        return invalid(path, List.of());
    }
    private static ValidationFailure invalid(String path, List<String> missingFields) {
        return rejected(true, path, missingFields);
    }
    private static ValidationFailure rejected(boolean repairable, String path, List<String> missingFields) {
        return new ValidationFailure(repairable, path, missingFields);
    }

    public static final class ValidationFailure extends DomainException {
        private final boolean repairable;
        private final String fieldPath;
        private final List<String> missingFields;

        private ValidationFailure(boolean repairable, String fieldPath, List<String> missingFields) {
            super("CHAT_TOOL_ARGUMENT_INVALID", "Display tool arguments are invalid");
            this.repairable = repairable;
            this.fieldPath = fieldPath;
            this.missingFields = List.copyOf(missingFields);
        }

        public boolean repairable() { return repairable; }
        public String fieldPath() { return fieldPath; }
        public List<String> missingFields() { return missingFields; }
    }
    public record ValidatedBlock(DisplayComponent component, List<Map<String, Object>> rows,
                                 Map<String, Object> privateReference) {}
}
