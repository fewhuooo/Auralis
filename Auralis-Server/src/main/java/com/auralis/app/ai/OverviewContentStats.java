package com.auralis.app.ai;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;
import java.util.Set;

/**
 * Statistics about candidate source text for Overview planning.
 * The estimate is UTF-8 bytes, not a model tokenizer result. Text is never rewritten here.
 */
public final class OverviewContentStats {
    public enum EstimateKind {
        UTF8_BYTE_UPPER_ESTIMATE
    }

    public enum SectionCountKind {
        TEXT_FRAGMENT_HEURISTIC,
        EXPLICIT_STRUCTURE_METADATA
    }

    private static final int MIN_REPEATED_BOUNDARY_LINES = 2;

    private final int sourceCount;
    private final int sectionCount;
    private final SectionCountKind sectionCountKind;
    private final OptionalInt pageCount;
    private final long rawUtf8Bytes;
    private final long effectiveUtf8Bytes;
    private final String contentRevision;

    private OverviewContentStats(int sourceCount, int sectionCount, SectionCountKind sectionCountKind,
                                 long rawUtf8Bytes,
                                 long effectiveUtf8Bytes, String contentRevision) {
        this.sourceCount = sourceCount;
        this.sectionCount = sectionCount;
        this.sectionCountKind = sectionCountKind;
        this.pageCount = OptionalInt.empty();
        this.rawUtf8Bytes = rawUtf8Bytes;
        this.effectiveUtf8Bytes = effectiveUtf8Bytes;
        this.contentRevision = contentRevision == null ? "" : contentRevision;
    }

    public static OverviewContentStats fromTexts(List<String> texts, int sourceCount,
                                                  String contentRevision) {
        return fromTextsInternal(texts, sourceCount, null, contentRevision);
    }

    /** Uses caller-supplied structural metadata instead of guessing sections from serialized text. */
    public static OverviewContentStats fromTexts(List<String> texts, int sourceCount,
                                                  int knownSectionCount, String contentRevision) {
        if (knownSectionCount < 0) {
            throw new IllegalArgumentException("knownSectionCount must not be negative");
        }
        return fromTextsInternal(texts, sourceCount, knownSectionCount, contentRevision);
    }

    private static OverviewContentStats fromTextsInternal(List<String> texts, int sourceCount,
                                                           Integer knownSectionCount,
                                                           String contentRevision) {
        if (sourceCount < 0) {
            throw new IllegalArgumentException("sourceCount must not be negative");
        }
        List<String> safeTexts = texts == null ? List.of() : texts;
        long rawBytes = 0;
        List<List<String>> linesByText = new ArrayList<>(safeTexts.size());
        Map<String, Integer> headerOccurrences = new HashMap<>();
        Map<String, Integer> footerOccurrences = new HashMap<>();
        for (String text : safeTexts) {
            String safeText = text == null ? "" : text;
            rawBytes = saturatedAdd(rawBytes, utf8Bytes(safeText));
            List<String> lines = List.of(safeText.split("\\R", -1));
            linesByText.add(lines);
            String header = firstNonBlank(lines);
            String footer = lastNonBlank(lines);
            if (header != null) {
                headerOccurrences.merge(normalizeBoundary(header), 1, Integer::sum);
            }
            if (footer != null) {
                footerOccurrences.merge(normalizeBoundary(footer), 1, Integer::sum);
            }
        }

        Set<String> repeatedHeaders = new HashSet<>();
        Set<String> repeatedFooters = new HashSet<>();
        headerOccurrences.forEach((line, occurrences) -> {
            if (occurrences >= MIN_REPEATED_BOUNDARY_LINES && !line.isBlank()) {
                repeatedHeaders.add(line);
            }
        });
        footerOccurrences.forEach((line, occurrences) -> {
            if (occurrences >= MIN_REPEATED_BOUNDARY_LINES && !line.isBlank()) {
                repeatedFooters.add(line);
            }
        });

        long effectiveBytes = 0;
        int sections = 0;
        for (List<String> lines : linesByText) {
            boolean hasEffectiveText = false;
            int headings = 0;
            int firstBoundaryIndex = firstNonBlankIndex(lines);
            int lastBoundaryIndex = lastNonBlankIndex(lines);
            for (int index = 0; index < lines.size(); index++) {
                String line = lines.get(index);
                String trimmed = line.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                String normalized = normalizeBoundary(trimmed);
                boolean repeatedHeader = index == firstBoundaryIndex && repeatedHeaders.contains(normalized);
                boolean repeatedFooter = index == lastBoundaryIndex && repeatedFooters.contains(normalized);
                if (repeatedHeader || repeatedFooter || isOcrSymbolNoise(trimmed)) {
                    continue;
                }
                hasEffectiveText = true;
                if (isHeading(trimmed)) {
                    headings++;
                }
                effectiveBytes = saturatedAdd(effectiveBytes, utf8Bytes(line));
                effectiveBytes = saturatedAdd(effectiveBytes, 1); // line separator upper bound
            }
            if (hasEffectiveText) {
                sections = saturatedAddInt(sections, Math.max(1, headings));
            }
        }

        SectionCountKind sectionCountKind = knownSectionCount == null
                ? SectionCountKind.TEXT_FRAGMENT_HEURISTIC
                : SectionCountKind.EXPLICIT_STRUCTURE_METADATA;
        return new OverviewContentStats(sourceCount,
                knownSectionCount == null ? sections : knownSectionCount,
                sectionCountKind, rawBytes, effectiveBytes, contentRevision);
    }

    public int sourceCount() {
        return sourceCount;
    }

    /** Structural count when supplied; otherwise a heuristic where each nonempty fragment contributes at least one. */
    public int sectionCount() {
        return sectionCount;
    }

    public SectionCountKind sectionCountKind() {
        return sectionCountKind;
    }

    /** Page count is unknown because source fragments do not carry reliable page metadata. */
    public OptionalInt pageCount() {
        return pageCount;
    }

    /** Conservative byte-based planning estimate, not an exact tokenizer count. */
    public long estimatedEffectiveTokens() {
        return effectiveUtf8Bytes;
    }

    public long effectiveUtf8Bytes() {
        return effectiveUtf8Bytes;
    }

    public long rawUtf8Bytes() {
        return rawUtf8Bytes;
    }

    public EstimateKind estimateKind() {
        return EstimateKind.UTF8_BYTE_UPPER_ESTIMATE;
    }

    public String contentRevision() {
        return contentRevision;
    }

    private static String firstNonBlank(List<String> lines) {
        for (String line : lines) {
            if (!line.isBlank()) {
                return line.trim();
            }
        }
        return null;
    }

    private static String lastNonBlank(List<String> lines) {
        for (int index = lines.size() - 1; index >= 0; index--) {
            if (!lines.get(index).isBlank()) {
                return lines.get(index).trim();
            }
        }
        return null;
    }

    private static int firstNonBlankIndex(List<String> lines) {
        for (int index = 0; index < lines.size(); index++) {
            if (!lines.get(index).isBlank()) {
                return index;
            }
        }
        return -1;
    }

    private static int lastNonBlankIndex(List<String> lines) {
        for (int index = lines.size() - 1; index >= 0; index--) {
            if (!lines.get(index).isBlank()) {
                return index;
            }
        }
        return -1;
    }

    private static String normalizeBoundary(String line) {
        return line.trim().replaceAll("\\s+", " ").toLowerCase(java.util.Locale.ROOT);
    }

    private static boolean isOcrSymbolNoise(String line) {
        int symbols = 0;
        for (int offset = 0; offset < line.length();) {
            int codePoint = line.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (Character.isLetterOrDigit(codePoint)) {
                return false;
            }
            if (!isNoiseSymbol(codePoint)) {
                return false;
            }
            symbols++;
        }
        return symbols >= 4;
    }

    private static boolean isNoiseSymbol(int codePoint) {
        return "•·∙⋅●○▪▫■□◆◇★☆※|_-=*#·・‧…".indexOf(codePoint) >= 0;
    }

    private static boolean isHeading(String line) {
        String value = line.trim();
        return value.startsWith("#")
                || value.matches("(?i)^(chapter|section|part)\\s+[\\p{Alnum}一二三四五六七八九十].*")
                || value.matches("^第[\\p{Alnum}一二三四五六七八九十百千]+[章节部分].*")
                || value.matches("^[0-9]+(?:\\.[0-9]+)*[.)、]\\s*\\S.*");
    }

    private static long utf8Bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8).length;
    }

    private static long saturatedAdd(long left, long right) {
        if (Long.MAX_VALUE - left < right) {
            return Long.MAX_VALUE;
        }
        return left + right;
    }

    private static int saturatedAddInt(int left, int right) {
        if (Integer.MAX_VALUE - left < right) {
            return Integer.MAX_VALUE;
        }
        return left + right;
    }
}
