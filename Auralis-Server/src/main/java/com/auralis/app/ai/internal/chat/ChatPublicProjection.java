package com.auralis.app.ai.internal.chat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Allowlisted protocol-1 public part and Markdown projection builder. */
public final class ChatPublicProjection {
    private ChatPublicProjection() {}

    public static String blockBoundary() { return "\n"; }

    public static String publicTextDelta(ChatStreamParser.Component component, Map<String, Object> row) {
        Object type = row.get("type");
        if ("meta".equals(type)) {
            return line("### " + safe(row.get("title"))
                    + (blank(row.get("description")) ? "" : "\n" + safe(row.get("description"))));
        }
        if ("stem".equals(type)) return line("**" + safe(row.get("question")) + "**");
        if ("option".equals(type)) return line("- " + safe(row.get("key")) + ". " + safe(row.get("text")));
        if ("question".equals(type) || "stem".equals(type)) return line("**" + safe(row.get("question")) + "**");
        if (!"item".equals(type)) return "";
        return switch (component) {
            case STEPS, COMPARE -> line("- **" + safe(row.get("title")) + "**"
                    + (blank(row.get("description")) ? "" : ": " + safe(row.get("description"))));
            case ROADMAP -> line("- " + safe(row.get("title"))
                    + (blank(row.get("description")) ? "" : ": " + safe(row.get("description")))
                    + (blank(row.get("tag")) ? "" : " (" + safe(row.get("tag")) + ")"));
            case CHART -> line("- " + safe(row.get("label")) + ": " + number(row.get("value")));
            case QUIZ -> "";
            case QUESTION -> line("**" + safe(row.get("question")) + "**");
        };
    }

    public static Map<String, Object> blockPart(String blockId, ChatStreamParser.Component component,
            List<Map<String, Object>> rows, boolean validActivity) {
        return blockPart(blockId, component, rows, validActivity ? "READY" : "INVALID");
    }

    public static Map<String, Object> blockPart(String blockId, ChatStreamParser.Component component,
            List<Map<String, Object>> rows, String state) {
        return blockPart(blockId, component, rows, state, null);
    }

    public static Map<String, Object> blockPart(String blockId, ChatStreamParser.Component component,
            List<Map<String, Object>> rows, String state, String questionId) {
        Map<String, Object> meta = new LinkedHashMap<>();
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String type = Objects.toString(row.get("type"), "");
            switch (component) {
                case STEPS, COMPARE, ROADMAP, CHART -> {
                    if ("meta".equals(type)) {
                        copy(row, meta, "title", "description", "tag", "current", "chartType", "unit");
                    } else if ("item".equals(type)) {
                        Map<String, Object> item = new LinkedHashMap<>();
                        if (component == ChatStreamParser.Component.CHART) copy(row, item, "label", "value");
                        else copy(row, item, "title", "description", "tag", "current");
                        items.add(item);
                    }
                }
                case QUIZ -> {
                    if ("stem".equals(type)) {
                        meta.put("question", row.get("question"));
                        String questionType = Objects.toString(row.get("questionType"), "single");
                        meta.put("questionType", "multiple".equals(questionType) ? "multiple" : "single");
                    } else if ("option".equals(type)) {
                        Map<String, Object> item = new LinkedHashMap<>(); copy(row, item, "key", "text"); items.add(item);
                    }
                }
                case QUESTION -> {
                    if ("stem".equals(type)) {
                        meta.put("question", row.get("question"));
                        if (row.containsKey("placeholder")) meta.put("placeholder", row.get("placeholder"));
                    }
                }
            }
        }
        Map<String, Object> part = new LinkedHashMap<>();
        part.put("id", blockId); part.put("componentId", blockId); part.put("kind", "block");
        part.put("component", component.name().toLowerCase(java.util.Locale.ROOT));
        part.put("state", state);
        part.put("meta", meta); part.put("items", List.copyOf(items));
        if (component == ChatStreamParser.Component.QUIZ || component == ChatStreamParser.Component.QUESTION) {
            part.put("questionId", questionId == null ? blockId : questionId);
        }
        return Map.copyOf(part);
    }

    public static String markdown(List<Map<String, Object>> parts) {
        StringBuilder text = new StringBuilder();
        for (Map<String, Object> part : parts) {
            if ("text".equals(part.get("kind"))) {
                text.append(Objects.toString(part.get("text"), ""));
            } else if ("block".equals(part.get("kind"))) {
                text.append(blockBoundary()).append(blockMarkdown(part)).append(blockBoundary());
            }
        }
        return text.toString();
    }

    public static String blockMarkdown(Map<String, Object> part) {
        StringBuilder markdown = new StringBuilder();
        Object component = part.get("component");
        Map<?, ?> meta = part.get("meta") instanceof Map<?, ?> map ? map : Map.of();
        List<?> items = part.get("items") instanceof List<?> list ? list : List.of();
        if ("quiz".equals(component)) {
            markdown.append("**").append(safe(meta.get("question"))).append("**\n");
            for (Object value : items) if (value instanceof Map<?, ?> item)
                markdown.append("- ").append(safe(item.get("key"))).append(". ").append(safe(item.get("text"))).append('\n');
            appendSubmittedAnswer(markdown, part.get("submittedAnswer"));
        } else if ("question".equals(component)) {
            markdown.append("**").append(safe(meta.get("question"))).append("**\n");
            appendSubmittedAnswer(markdown, part.get("submittedAnswer"));
        } else {
            markdown.append("### ").append(safe(meta.get("title")));
            if (!blank(meta.get("description"))) markdown.append('\n').append(safe(meta.get("description")));
            markdown.append('\n');
            for (Object value : items) if (value instanceof Map<?, ?> item) {
                switch (Objects.toString(component, "")) {
                    case "chart" -> markdown.append("- ").append(safe(item.get("label"))).append(": ").append(number(item.get("value"))).append('\n');
                    case "steps", "compare" -> markdown.append("- **").append(safe(item.get("title"))).append("**")
                            .append(blank(item.get("description")) ? "" : ": " + safe(item.get("description"))).append('\n');
                    case "roadmap" -> markdown.append("- ").append(safe(item.get("title")))
                            .append(blank(item.get("description")) ? "" : ": " + safe(item.get("description"))).append('\n');
                    default -> { }
                }
            }
        }
        return markdown.toString();
    }

    private static void appendSubmittedAnswer(StringBuilder markdown, Object answer) {
        if (answer instanceof String text) markdown.append("Your answer: ").append(safe(text)).append('\n');
        else if (answer instanceof List<?> values && !values.isEmpty()) {
            markdown.append("Your answer: ");
            markdown.append(values.stream().map(ChatPublicProjection::safe).collect(java.util.stream.Collectors.joining(", ")))
                    .append('\n');
        }
    }

    private static void copy(Map<String, Object> source, Map<String, Object> target, String... keys) {
        for (String key : keys) if (source.containsKey(key)) target.put(key, source.get(key));
    }
    private static String line(String value) { return value + "\n"; }
    private static boolean blank(Object value) { return value == null || value.toString().isBlank(); }
    private static String safe(Object value) { return Objects.toString(value, "").replace("\r", " ").replace("\n", " "); }
    private static String number(Object value) { return value instanceof BigDecimal decimal ? decimal.stripTrailingZeros().toPlainString() : safe(value); }
}
