package com.auralis.app.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Deterministic, bounded formatting helpers for completed Overview content. */
public final class OverviewBodyFormatter {

    private static final Pattern ATX_HEADING = Pattern.compile("^( {0,3})(#{1,6})[ \\t]+(.+?)\\s*#*\\s*$");
    private static final Pattern FENCE_OPEN = Pattern.compile("^ {0,3}(`{3,}|~{3,})(.*)$");
    private static final Pattern TABLE_SEPARATOR = Pattern.compile("^\\s*\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$");

    private OverviewBodyFormatter() {
    }

    /** Raised when one indivisible Markdown atom cannot fit without losing content. */
    public static final class CapacityException extends IllegalArgumentException {
        public CapacityException(String message) {
            super(message);
        }
    }

    /**
     * Normalizes ATX heading depth, then packs Markdown structure without truncating its source text.
     * Fenced-code and table boundaries may be repeated on continuation parts.
     */
    public static List<String> splitAndNormalize(String detailedContent, int maxChars) {
        requireBoundedInput(detailedContent, "detailedContent");
        if (detailedContent.isBlank()) {
            throw new IllegalArgumentException("detailedContent must not be blank");
        }
        if (maxChars < 1) throw new IllegalArgumentException("maxChars must be positive");

        List<Line> lines = linesOf(detailedContent);
        int minHeading = 7;
        boolean inFence = false;
        char fenceChar = 0;
        int fenceLength = 0;
        for (Line line : lines) {
            String text = line.text();
            if (inFence) {
                if (isFenceClose(text, fenceChar, fenceLength)) {
                    inFence = false;
                }
                continue;
            }
            Matcher opening = FENCE_OPEN.matcher(text);
            if (opening.matches()) {
                String marker = opening.group(1);
                fenceChar = marker.charAt(0);
                fenceLength = marker.length();
                inFence = true;
                continue;
            }
            Matcher heading = ATX_HEADING.matcher(text);
            if (heading.matches()) {
                minHeading = Math.min(minHeading, heading.group(2).length());
            }
        }
        if (inFence) {
            throw new IllegalArgumentException("Unclosed fenced code block");
        }

        int headingOffset = minHeading <= 2 ? 3 - minHeading : 0;
        String normalized = normalizeHeadings(lines, headingOffset);
        List<String> parts = packMarkdown(normalized, maxChars);
        if (parts.isEmpty()) throw new CapacityException("Formatted content produced no parts");
        return List.copyOf(parts);
    }

    /** Extracts bounded ATX heading text outside fenced code blocks. */
    public static List<String> headings(String markdown, int maxItems, int maxTotalChars) {
        if (markdown == null) {
            throw new IllegalArgumentException("markdown must not be null");
        }
        if (maxItems < 0 || maxTotalChars < 0) throw new IllegalArgumentException("Heading bounds must be nonnegative");
        if (maxItems == 0 || maxTotalChars == 0 || markdown.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        int used = 0;
        char fenceChar = 0;
        int fenceLength = 0;
        boolean inFence = false;
        for (Line line : linesOf(markdown)) {
            if (inFence) {
                if (isFenceClose(line.text(), fenceChar, fenceLength)) {
                    inFence = false;
                }
                continue;
            }
            Matcher opening = FENCE_OPEN.matcher(line.text());
            if (opening.matches()) {
                fenceChar = opening.group(1).charAt(0);
                fenceLength = opening.group(1).length();
                inFence = true;
                continue;
            }
            Matcher heading = ATX_HEADING.matcher(line.text());
            if (!heading.matches()) {
                continue;
            }
            String text = heading.group(3).strip();
            if (text.isEmpty()) {
                continue;
            }
            if (result.size() >= maxItems || used + text.length() > maxTotalChars) {
                break;
            }
            result.add(text);
            used += text.length();
        }
        return List.copyOf(result);
    }

    private static String normalizeHeadings(List<Line> lines, int offset) {
        StringBuilder result = new StringBuilder();
        char fenceChar = 0;
        int fenceLength = 0;
        boolean inFence = false;
        for (Line line : lines) {
            String text = line.text();
            if (!inFence) {
                Matcher opening = FENCE_OPEN.matcher(text);
                if (opening.matches()) {
                    fenceChar = opening.group(1).charAt(0);
                    fenceLength = opening.group(1).length();
                    inFence = true;
                } else {
                    Matcher heading = ATX_HEADING.matcher(text);
                    if (heading.matches()) {
                        int level = Math.min(6, heading.group(2).length() + offset);
                        text = heading.group(1) + "#".repeat(level) + " " + heading.group(3).stripTrailing();
                    }
                }
            } else if (isFenceClose(text, fenceChar, fenceLength)) {
                inFence = false;
            }
            result.append(text).append(line.ending());
        }
        return result.toString();
    }

    private static List<String> packMarkdown(String content, int maxChars) {
        List<Line> lines = linesOf(content);
        List<String> output = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int i = 0;
        while (i < lines.size()) {
            Line line = lines.get(i);
            Matcher opening = FENCE_OPEN.matcher(line.text());
            if (opening.matches()) {
                if (current.length() > 0 && current.length() + line.full().length() > maxChars) {
                    flush(current, output);
                }
                List<Line> block = new ArrayList<>();
                block.add(line);
                char marker = opening.group(1).charAt(0);
                int markerLength = opening.group(1).length();
                i++;
                while (i < lines.size()) {
                    Line body = lines.get(i++);
                    if (isFenceClose(body.text(), marker, markerLength)) {
                        block.add(body);
                        break;
                    }
                    block.add(body);
                }
                String open = block.get(0).full();
                String close = block.get(block.size() - 1).full();
                List<Line> bodyLines = block.subList(1, block.size() - 1);
                List<String> codeParts = splitFence(open, close, bodyLines, maxChars);
                for (String part : codeParts) {
                    appendOrFlush(current, part, maxChars, output);
                }
                continue;
            }

            if (line.text().isBlank()) {
                String blank = line.full();
                appendOrFlush(current, blank, maxChars, output);
                i++;
                continue;
            }

            if (i + 1 < lines.size() && line.text().contains("|")
                    && TABLE_SEPARATOR.matcher(lines.get(i + 1).text()).matches()) {
                if (current.length() > 0 && current.length() + line.full().length() > maxChars) {
                    flush(current, output);
                }
                List<String> tableParts = splitTable(lines, i, maxChars);
                for (String part : tableParts) {
                    appendOrFlush(current, part, maxChars, output);
                }
                i = tableEnd(lines, i);
                continue;
            }

            int end = i;
            while (end < lines.size() && !lines.get(end).text().isBlank()
                    && !FENCE_OPEN.matcher(lines.get(end).text()).matches()
                    && !(end + 1 < lines.size() && lines.get(end).text().contains("|")
                    && TABLE_SEPARATOR.matcher(lines.get(end + 1).text()).matches())) {
                end++;
            }
            StringBuilder block = new StringBuilder();
            for (int j = i; j < end; j++) {
                block.append(lines.get(j).full());
            }
            List<String> textParts = splitTextBlock(block.toString(), maxChars);
            for (String part : textParts) {
                appendOrFlush(current, part, maxChars, output);
            }
            i = end;
        }
        flush(current, output);
        return output;
    }

    private static List<String> splitFence(String open, String close, List<Line> body, int maxChars) {
        String delimiter = open.endsWith("\r\n") ? "\r\n" : "\n";
        String closeLine = close.isEmpty() ? "" : close;
        List<String> result = new ArrayList<>();
        StringBuilder chunk = new StringBuilder(open);
        for (Line line : body) {
            int projected = chunk.length() + line.full().length() + closeLine.length();
            if (projected > maxChars && chunk.length() > open.length()) {
                chunk.append(closeLine);
                result.add(chunk.toString());
                chunk = new StringBuilder(open);
                projected = chunk.length() + line.full().length() + closeLine.length();
            }
            if (projected > maxChars) {
                throw new CapacityException("A fenced-code line cannot fit with repeated fence markers");
            }
            chunk.append(line.full());
        }
        if (chunk.length() + closeLine.length() > maxChars) {
            if (chunk.length() == open.length()) {
                throw new CapacityException("Fenced-code markers exceed maxChars");
            }
            chunk.append(closeLine);
            result.add(chunk.toString());
            chunk = new StringBuilder(open);
        }
        chunk.append(closeLine);
        if (chunk.length() > maxChars) {
            throw new CapacityException("Fenced-code markers exceed maxChars");
        }
        result.add(chunk.toString());
        return result;
    }

    private static List<String> splitTable(List<Line> lines, int start, int maxChars) {
        int end = tableEnd(lines, start);
        String header = lines.get(start).full();
        String separator = lines.get(start + 1).full();
        String prefix = header + separator;
        if (prefix.length() > maxChars) {
            throw new CapacityException("Markdown table header and separator exceed maxChars");
        }
        List<String> result = new ArrayList<>();
        StringBuilder part = new StringBuilder(prefix);
        for (int i = start + 2; i < end; i++) {
            String row = lines.get(i).full();
            if (row.length() + prefix.length() > maxChars) {
                throw new CapacityException("A Markdown table row cannot fit with its repeated header");
            }
            if (part.length() + row.length() > maxChars) {
                result.add(part.toString());
                part = new StringBuilder(prefix);
            }
            part.append(row);
        }
        result.add(part.toString());
        return result;
    }

    private static int tableEnd(List<Line> lines, int start) {
        int i = start + 2;
        while (i < lines.size() && !lines.get(i).text().isBlank() && lines.get(i).text().contains("|")) {
            i++;
        }
        return i;
    }

    private static List<String> splitTextBlock(String text, int maxChars) {
        if (text.length() <= maxChars) {
            return List.of(text);
        }
        List<String> parts = new ArrayList<>();
        int start = 0;
        while (start < text.length()) {
            int limit = Math.min(text.length(), start + maxChars);
            if (limit < text.length() && Character.isHighSurrogate(text.charAt(limit - 1))
                    && Character.isLowSurrogate(text.charAt(limit))) {
                limit--;
            }
            int boundary = chooseTextBoundary(text, start, limit);
            if (boundary <= start) {
                throw new CapacityException("A Markdown line has no safe boundary within maxChars");
            }
            parts.add(text.substring(start, boundary));
            start = boundary;
        }
        return parts;
    }

    private static int chooseTextBoundary(String text, int start, int limit) {
        int newline = text.lastIndexOf('\n', limit - 1);
        if (newline >= start) {
            return newline + 1;
        }
        int sentence = -1;
        for (int i = limit - 1; i >= start; i--) {
            char c = text.charAt(i);
            if (c == '.' || c == '?' || c == '!' || c == '。' || c == '？' || c == '！') {
                sentence = i + 1;
                break;
            }
        }
        if (sentence > start) {
            return sentence;
        }
        int whitespace = -1;
        for (int i = limit - 1; i >= start; i--) {
            if (Character.isWhitespace(text.charAt(i))) {
                whitespace = i + 1;
                break;
            }
        }
        return whitespace > start ? whitespace : -1;
    }

    private static void appendOrFlush(StringBuilder current, String text, int maxChars, List<String> output) {
        if (text.length() > maxChars) {
            for (String part : splitTextBlock(text, maxChars)) {
                appendOrFlush(current, part, maxChars, output);
            }
            return;
        }
        if (current.length() > 0 && current.length() + text.length() > maxChars) {
            flush(current, output);
        }
        current.append(text);
    }

    private static void flush(StringBuilder current, List<String> output) {
        if (current.length() > 0) {
            output.add(current.toString());
            current.setLength(0);
        }
    }

    private static boolean isFenceClose(String line, char marker, int minimumLength) {
        String regex = "^ {0,3}" + Pattern.quote(String.valueOf(marker)) + "{" + minimumLength + ",}[ \\t]*$";
        return Pattern.matches(regex, line);
    }

    private static List<Line> linesOf(String value) {
        List<Line> result = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\n') {
                int textEnd = i > start && value.charAt(i - 1) == '\r' ? i - 1 : i;
                result.add(new Line(value.substring(start, textEnd), value.substring(textEnd, i + 1)));
                start = i + 1;
            }
        }
        if (start < value.length()) {
            result.add(new Line(value.substring(start), ""));
        }
        return result;
    }

    private static void requireBoundedInput(String value, String name) {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException(name + " must not be empty");
        }
    }

    private record Line(String text, String ending) {
        String full() {
            return text + ending;
        }
    }
}
