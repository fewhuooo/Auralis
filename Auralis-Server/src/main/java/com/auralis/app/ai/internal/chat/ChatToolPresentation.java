package com.auralis.app.ai.internal.chat;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;

/** Maps internal provider tool identifiers into safe Chinese user-facing display labels. */
final class ChatToolPresentation {
    private static final int MAX_QUERY_CODE_POINTS = 24;
    private static final int MAX_TITLE_CODE_POINTS = 18;
    private static final Map<String, String> DISPLAY_NAMES = Map.ofEntries(
            Map.entry(ChatReadTools.SEARCH, "检索资料"),
            Map.entry(ChatReadTools.LIST_SOURCES, "查看资料目录"),
            Map.entry(ChatReadTools.READ_EXCERPT, "阅读资料摘录"),
            Map.entry(ChatReadTools.READ_SOURCE_OVERVIEW, "查看资料总览"),
            Map.entry(DisplayToolRegistry.RENDER_STEPS, "生成流程卡片"),
            Map.entry(DisplayToolRegistry.RENDER_COMPARE, "生成对比卡片"),
            Map.entry(DisplayToolRegistry.RENDER_ROADMAP, "生成路线图"),
            Map.entry(DisplayToolRegistry.RENDER_CHART, "生成数据图表"),
            Map.entry(DisplayToolRegistry.RENDER_QUIZ, "生成自测选择题"),
            Map.entry(DisplayToolRegistry.RENDER_QUESTION, "生成开放问答")
    );

    record ToolDisplay(String name, String label) {}

    private ChatToolPresentation() {}

    static ToolDisplay describe(
            String rawToolName,
            String argumentsJson,
            ChatReadTools.ReadScope readScope,
            ObjectMapper mapper
    ) {
        String displayName = DISPLAY_NAMES.getOrDefault(rawToolName, "检索与分析");
        JsonNode args = parseObjectQuietly(argumentsJson, mapper);
        String label = switch (rawToolName == null ? "" : rawToolName) {
            case ChatReadTools.SEARCH -> buildSearchLabel(args, displayName);
            case ChatReadTools.READ_EXCERPT -> buildSourceLabel(args, readScope, "阅读《", "》片段", displayName);
            case ChatReadTools.READ_SOURCE_OVERVIEW -> buildSourceLabel(args, readScope, "查看《", "》总览", displayName);
            default -> displayName;
        };
        return new ToolDisplay(displayName, label);
    }

    private static String buildSearchLabel(JsonNode args, String fallback) {
        if (args == null) return fallback;
        JsonNode queryNode = args.get("query");
        if (queryNode == null || !queryNode.isTextual()) return fallback;
        String collapsed = collapseWhitespace(queryNode.textValue());
        if (collapsed.isEmpty()) return fallback;
        return "检索「" + truncate(collapsed, MAX_QUERY_CODE_POINTS) + "」";
    }

    private static String buildSourceLabel(
            JsonNode args,
            ChatReadTools.ReadScope readScope,
            String prefix,
            String suffix,
            String fallback
    ) {
        if (args == null || readScope == null) return fallback;
        JsonNode sourceNode = args.get("sourceId");
        if (sourceNode == null || !sourceNode.isTextual()) return fallback;
        UUID sourceId;
        try {
            sourceId = UUID.fromString(sourceNode.textValue().trim());
        } catch (IllegalArgumentException invalid) {
            return fallback;
        }
        String title = collapseWhitespace(readScope.titleFor(sourceId));
        if (title.isEmpty()) return fallback;
        return prefix + truncate(title, MAX_TITLE_CODE_POINTS) + suffix;
    }

    private static JsonNode parseObjectQuietly(String json, ObjectMapper mapper) {
        if (json == null || json.isBlank() || mapper == null) return null;
        try {
            JsonNode tree = mapper.readTree(json);
            return tree != null && tree.isObject() ? tree : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String collapseWhitespace(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("\\s+", " ").trim();
    }

    private static String truncate(String text, int maxCodePoints) {
        if (text.codePointCount(0, text.length()) <= maxCodePoints) return text;
        int cutoff = text.offsetByCodePoints(0, maxCodePoints);
        return text.substring(0, cutoff) + "…";
    }
}
