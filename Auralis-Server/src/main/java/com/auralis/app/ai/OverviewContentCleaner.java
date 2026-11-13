package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Applies validated model exclusions without rewriting retained source text. */
final class OverviewContentCleaner {
    private static final Pattern LINE = Pattern.compile("[^\\r\\n]*(?:\\r\\n|\\r|\\n|$)");
    private static final Set<String> CATEGORIES = Set.of("COVER_COPYRIGHT", "PREFACE_REVISION", "TOC",
            "COURSE_ADMIN", "CONTENT_PREVIEW");

    static Input prepare(String original) {
        List<Span> lines = new ArrayList<>();
        var matcher = LINE.matcher(original);
        while (matcher.find()) {
            if (matcher.start() == matcher.end()) continue;
            lines.add(new Span(matcher.start(), matcher.end()));
        }
        return new Input(original, List.copyOf(lines));
    }

    static Cleaned apply(ObjectMapper mapper, Input input, String response) {
        return apply(input, exclusions(mapper, response, 1, input.lines().size()));
    }

    static List<Exclusion> exclusions(ObjectMapper mapper, String response, int firstLine, int lastLine) {
        JsonNode root = readJson(mapper, response, "Invalid Overview exclusion ranges");
        if (root == null || !root.isObject() || root.size() != 1 || !root.path("exclusions").isArray()) {
            throw invalid();
        }
        List<Exclusion> exclusions = new ArrayList<>();
        int previous = firstLine - 1;
        for (JsonNode item : root.path("exclusions")) {
            if (!item.isObject() || item.size() != 4 || !item.path("startLine").isIntegralNumber()
                    || !item.path("endLine").isIntegralNumber() || !item.path("startLine").canConvertToInt()
                    || !item.path("endLine").canConvertToInt() || !item.path("category").isTextual()
                    || !CATEGORIES.contains(item.path("category").asText())
                    || !item.path("reason").isTextual() || item.path("reason").asText().isBlank()) throw invalid();
            int start = item.path("startLine").asInt();
            int end = item.path("endLine").asInt();
            if (start <= previous || end < start || end > lastLine) throw invalid();
            exclusions.add(new Exclusion(start, end, item.path("category").asText(), item.path("reason").asText()));
            previous = end;
        }
        return exclusions;
    }

    static Cleaned apply(Input input, List<Exclusion> exclusions) {
        StringBuilder cleaned = new StringBuilder();
        List<RetainedSpan> retained = new ArrayList<>();
        int cursor = 0;
        for (Exclusion exclusion : exclusions) {
            int start = input.lines().get(exclusion.startLine() - 1).start();
            if (cursor < start) {
                retained.add(new RetainedSpan(cursor, start, cleaned.length(), cleaned.length() + start - cursor));
                cleaned.append(input.original(), cursor, start);
            }
            cursor = input.lines().get(exclusion.endLine() - 1).end();
        }
        if (cursor < input.original().length()) {
            retained.add(new RetainedSpan(cursor, input.original().length(), cleaned.length(),
                    cleaned.length() + input.original().length() - cursor));
            cleaned.append(input.original(), cursor, input.original().length());
        }
        String text = cleaned.toString();
        if (text.isBlank()) throw new DomainException("MODEL_PROVIDER_ERROR", "Overview cleaning retained no content");
        return new Cleaned(text, List.copyOf(retained), List.copyOf(exclusions));
    }

    static JsonNode readJson(ObjectMapper mapper, String response, String error) {
        if (response == null || response.isBlank()) throw new DomainException("MODEL_PROVIDER_ERROR", error);
        try {
            return mapper.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(response);
        } catch (JacksonException exception) {
            throw new DomainException("MODEL_PROVIDER_ERROR", error);
        }
    }

    private static DomainException invalid() {
        return new DomainException("MODEL_PROVIDER_ERROR", "Invalid Overview exclusion ranges");
    }

    record Input(String original, List<Span> lines) {
        String numberedText() {
            StringBuilder numbered = new StringBuilder("原文总行数：").append(lines.size()).append("\n\n");
            appendNumbered(numbered, 1, lines.size());
            return numbered.toString();
        }

        void appendNumbered(StringBuilder target, int firstLine, int lastLine) {
            for (int line = firstLine; line <= lastLine; line++) {
                appendNumbered(target, line, lines.get(line - 1));
            }
        }

        void appendNumbered(StringBuilder target, int line, Span span) {
            target.append("[L").append(line).append("] ").append(original, span.start(), span.end());
            if (original.charAt(span.end() - 1) != '\n') target.append('\n');
        }
    }
    record Span(int start, int end) { }
    record Exclusion(int startLine, int endLine, String category, String reason) { }
    record RetainedSpan(int originalStart, int originalEnd, int cleanedStart, int cleanedEnd) { }
    record Cleaned(String text, List<RetainedSpan> retained, List<Exclusion> exclusions) { }
}
