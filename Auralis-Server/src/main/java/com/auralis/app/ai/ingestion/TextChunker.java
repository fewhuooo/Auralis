package com.auralis.app.ai.ingestion;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

public class TextChunker {

    private static final Pattern NUMBERED_LIST_ITEM = Pattern.compile("^\\s*\\d+[.)]\\s+\\S.*$");
    private static final Pattern TABLE_SEPARATOR = Pattern.compile("^\\s*\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$");

    private final int maxChars;
    private final int overlapChars;

    public TextChunker(int maxChars, int overlapChars) {
        if (maxChars <= 0 || overlapChars < 0 || overlapChars >= maxChars) {
            throw new IllegalArgumentException("overlapChars must be non-negative and smaller than maxChars");
        }
        this.maxChars = maxChars;
        this.overlapChars = overlapChars;
    }

    public List<TextChunk> chunk(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Text must not be blank");
        }
        String normalized = text.trim();
        List<Line> lines = lines(normalized);
        List<ProtectedBlock> protectedBlocks = protectedBlocks(lines, maxChars);
        List<TextChunk> chunks = new ArrayList<>();
        int start = 0;
        int ordinal = 0;
        while (start < normalized.length()) {
            int hardEnd = Math.min(normalized.length(), start + maxChars);
            if (hardEnd < normalized.length() && Character.isHighSurrogate(normalized.charAt(hardEnd - 1))
                    && Character.isLowSurrogate(normalized.charAt(hardEnd))) hardEnd++;
            int end = hardEnd == normalized.length() ? hardEnd
                    : safeSplit(normalized, start, start + maxChars / 2, hardEnd, hardEnd, protectedBlocks, lines);
            if (end <= start) throw new IllegalStateException("No Unicode-safe text chunk boundary is available");
            chunks.add(new TextChunk(ordinal++, normalized.substring(start, end), start, end));
            if (end == normalized.length()) break;
            start = overlapStart(normalized, start, end, protectedBlocks);
        }
        return List.copyOf(chunks);
    }

    public static int safeSplit(String text, int start, int lower, int preferred, int upper) {
        if (text == null || start < 0 || lower < start || preferred < lower || upper < preferred || upper > text.length()) {
            throw new IllegalArgumentException("Invalid text split bounds");
        }
        List<Line> lines = lines(text);
        return safeSplit(text, start, lower, preferred, upper,
                protectedBlocks(lines, Math.max(1, upper)), lines);
    }

    private static int safeSplit(String text, int start, int lower, int preferred, int upper,
                                 List<ProtectedBlock> protectedBlocks, List<Line> lines) {
        List<Boundary> candidates = boundaries(text, start, upper, protectedBlocks, lines);
        List<Boundary> preferredCandidates = candidates.stream()
                .filter(boundary -> boundary.position() >= lower).toList();
        int split = nearestBoundary(preferredCandidates, preferred);
        if (split < 0) split = nearestBoundary(candidates, preferred);
        if (split < 0) split = preferred;
        ProtectedBlock containing = containingBlock(split, protectedBlocks);
        if (containing != null && containing.start() > start) split = containing.start();
        if (split > start && split < text.length() && Character.isHighSurrogate(text.charAt(split - 1))
                && Character.isLowSurrogate(text.charAt(split))) {
            if (split < upper) split++;
            else split--;
        }
        return split > start && split <= upper ? split : -1;
    }

    private int overlapStart(String text, int chunkStart, int chunkEnd, List<ProtectedBlock> protectedBlocks) {
        if (overlapChars == 0) return chunkEnd;
        int start = Math.max(chunkStart + 1, chunkEnd - overlapChars);
        if (start >= chunkEnd) return chunkEnd;
        ProtectedBlock containing = containingBlock(start, protectedBlocks);
        if (containing != null) return containing.start() > chunkStart ? containing.start() : chunkEnd;
        if (start < text.length() - 1 && Character.isHighSurrogate(text.charAt(start - 1))
                && Character.isLowSurrogate(text.charAt(start))) start++;
        return start;
    }

    private static int nearestBoundary(List<Boundary> candidates, int preferred) {
        return candidates.stream().min(Comparator.comparingInt(Boundary::kind)
                .thenComparingInt(boundary -> Math.abs(boundary.position() - preferred))
                .thenComparingInt(boundary -> -boundary.position()))
                .map(Boundary::position).orElse(-1);
    }

    private static List<Boundary> boundaries(String text, int start, int upper,
                                             List<ProtectedBlock> protectedBlocks, List<Line> lines) {
        List<Boundary> result = new ArrayList<>();
        int low = 0;
        int high = lines.size();
        while (low < high) {
            int middle = (low + high) >>> 1;
            if (lines.get(middle).end() <= start) low = middle + 1;
            else high = middle;
        }
        for (int lineIndex = low; lineIndex < lines.size(); lineIndex++) {
            Line line = lines.get(lineIndex);
            if (line.start() >= upper) break;
            int boundary = line.end();
            if (boundary <= upper && boundary > start && !isProtected(boundary, protectedBlocks)) {
                result.add(new Boundary(boundary, line.content().isBlank() ? 0 : 2));
            }
            String content = line.content();
            for (int index = 0; index < content.length(); index++) {
                if (!isSentenceTerminator(content.charAt(index))) continue;
                int position = line.start() + index + 1;
                if (position >= upper || position >= text.length() || !Character.isWhitespace(text.charAt(position))) continue;
                while (position < upper && position < text.length() && text.charAt(position) != '\n'
                        && text.charAt(position) != '\r' && Character.isWhitespace(text.charAt(position))) position++;
                if (position > start && !isProtected(position, protectedBlocks)) result.add(new Boundary(position, 1));
            }
        }
        return result;
    }

    private static boolean isSentenceTerminator(char value) {
        return value == '。' || value == '！' || value == '？' || value == '；'
                || value == '.' || value == '!' || value == '?' || value == ';';
    }

    private static ProtectedBlock containingBlock(int position, List<ProtectedBlock> blocks) {
        int low = 0;
        int high = blocks.size();
        while (low < high) {
            int middle = (low + high) >>> 1;
            if (blocks.get(middle).start() < position) low = middle + 1;
            else high = middle;
        }
        if (low == 0) return null;
        ProtectedBlock block = blocks.get(low - 1);
        return position < block.end() ? block : null;
    }

    private static boolean isProtected(int position, List<ProtectedBlock> blocks) {
        return containingBlock(position, blocks) != null;
    }

    private static List<ProtectedBlock> protectedBlocks(List<Line> lines, int maxProtectedChars) {
        List<ProtectedBlock> result = new ArrayList<>();
        int index = 0;
        while (index < lines.size()) {
            Line line = lines.get(index);
            String trimmed = line.content().trim();
            int fenceLength = fenceLength(trimmed);
            if (fenceLength > 0) {
                char fence = trimmed.charAt(0);
                int end = index;
                while (++end < lines.size()) {
                    String closing = lines.get(end).content().trim();
                    if (closing.length() >= fenceLength && closing.charAt(0) == fence
                            && closing.chars().allMatch(character -> character == fence)) break;
                }
                addProtected(result, line.start(), lines.get(Math.min(end, lines.size() - 1)).end(), maxProtectedChars);
                index = Math.min(end + 1, lines.size());
                continue;
            }
            String mathClosing = mathOpening(trimmed);
            if (mathClosing != null) {
                int end = index;
                while (++end < lines.size() && !lines.get(end).content().trim().contains(mathClosing)) { }
                addProtected(result, line.start(), lines.get(Math.min(end, lines.size() - 1)).end(), maxProtectedChars);
                index = Math.min(end + 1, lines.size());
                continue;
            }
            if (isTableLine(trimmed)) {
                int end = index + 1;
                while (end < lines.size() && isTableLine(lines.get(end).content().trim())) end++;
                if (end - index >= 2 && (TABLE_SEPARATOR.matcher(lines.get(index).content()).matches()
                        || TABLE_SEPARATOR.matcher(lines.get(index + 1).content()).matches())) {
                    addProtected(result, line.start(), lines.get(end - 1).end(), maxProtectedChars);
                    index = end;
                    continue;
                }
            }
            if (NUMBERED_LIST_ITEM.matcher(line.content()).matches()) {
                int end = index + 1;
                while (end < lines.size()) {
                    Line next = lines.get(end);
                    if (!next.content().isBlank() && !NUMBERED_LIST_ITEM.matcher(next.content()).matches()
                            && !Character.isWhitespace(next.content().charAt(0))) break;
                    end++;
                }
                addProtected(result, line.start(), lines.get(end - 1).end(), maxProtectedChars);
                index = end;
                continue;
            }
            index++;
        }
        return List.copyOf(result);
    }

    private static void addProtected(List<ProtectedBlock> blocks, int start, int end, int maxProtectedChars) {
        if (end > start && end - start <= maxProtectedChars) blocks.add(new ProtectedBlock(start, end));
    }

    private static int fenceLength(String line) {
        if (line.length() < 3 || (line.charAt(0) != '`' && line.charAt(0) != '~')) return 0;
        char marker = line.charAt(0);
        int length = 0;
        while (length < line.length() && line.charAt(length) == marker) length++;
        return length >= 3 ? length : 0;
    }

    private static String mathOpening(String line) {
        if (line.startsWith("$$") && line.indexOf("$$", 2) < 0) return "$$";
        if (line.startsWith("\\[") && !line.contains("\\]")) return "\\]";
        return null;
    }

    private static boolean isTableLine(String line) {
        return line.indexOf('|') >= 0 && !line.isBlank();
    }

    private static List<Line> lines(String text) {
        List<Line> result = new ArrayList<>();
        int start = 0;
        while (start < text.length()) {
            int newline = text.indexOf('\n', start);
            int end = newline < 0 ? text.length() : newline + 1;
            int contentEnd = newline < 0 ? text.length() : newline;
            if (contentEnd > start && text.charAt(contentEnd - 1) == '\r') contentEnd--;
            result.add(new Line(start, end, text.substring(start, contentEnd)));
            start = end;
        }
        return List.copyOf(result);
    }

    private record Line(int start, int end, String content) { }
    private record ProtectedBlock(int start, int end) { }
    private record Boundary(int position, int kind) { }
}
