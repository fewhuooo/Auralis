package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.ingestion.TextChunker;
import com.auralis.app.shared.error.DomainException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Pure structural helpers for the opt-in, source-bound Overview pipeline. */
final class OverviewAdaptivePipeline {

    private OverviewAdaptivePipeline() { }

    record RoutedSection(int chapterIndex, String chapterTitle, OverviewSection section) { }

    record TextPart(String text, int startChar, int endChar) { }

    static List<RoutedSection> sections(OverviewResponse response) {
        if (response == null || response.outline() == null) return List.of();
        List<RoutedSection> result = new ArrayList<>();
        for (int chapterIndex = 0; chapterIndex < response.outline().size(); chapterIndex++) {
            OverviewChapter chapter = response.outline().get(chapterIndex);
            if (chapter == null || chapter.sections() == null) continue;
            for (OverviewSection section : chapter.sections()) {
                if (section != null) result.add(new RoutedSection(chapterIndex, chapter.title(), section));
            }
        }
        return List.copyOf(result);
    }

    /** Requires every input alias to be routed at least once; reuse across different sections is allowed. */
    static List<RoutedSection> requireCoverage(OverviewResponse response, Set<String> expectedAliases) {
        List<RoutedSection> sections = sections(response);
        Set<String> covered = new LinkedHashSet<>();
        for (RoutedSection routed : sections) {
            List<String> refs = routed.section().sourceIds();
            if (refs == null || refs.isEmpty()) throw invalidRoute();
            Set<String> withinSection = new LinkedHashSet<>();
            for (String alias : refs) {
                if (alias == null || !expectedAliases.contains(alias) || !withinSection.add(alias)) {
                    throw invalidRoute();
                }
                covered.add(alias);
            }
        }
        if (sections.isEmpty() || !covered.containsAll(expectedAliases)) throw invalidRoute();
        return sections;
    }

    static List<TextPart> splitAtStructureBoundary(String text) {
        if (text == null || text.codePointCount(0, text.length()) < 2) return List.of();
        int codePoints = text.codePointCount(0, text.length());
        int midpointCp = codePoints / 2;
        int midpointChar = text.offsetByCodePoints(0, midpointCp);
        int lower = text.offsetByCodePoints(0, Math.max(1, midpointCp / 2));
        int upper = text.offsetByCodePoints(0, Math.min(codePoints - 1, midpointCp + midpointCp / 2));
        int split = TextChunker.safeSplit(text, 0, lower, midpointChar, upper);
        if (split <= 0 || split >= text.length()) return List.of();
        return List.of(new TextPart(text.substring(0, split), 0, split),
                new TextPart(text.substring(split), split, text.length()));
    }

    /** Splits at a paragraph/newline boundary near the midpoint, falling back to a Unicode code-point boundary. */
    static List<TextPart> splitAtSafeBoundary(String text) {
        if (text == null || text.codePointCount(0, text.length()) < 2) return List.of();
        int midpointCp = text.codePointCount(0, text.length()) / 2;
        int midpointChar = text.offsetByCodePoints(0, midpointCp);
        int lower = text.offsetByCodePoints(0, Math.max(1, midpointCp / 2));
        int upper = text.offsetByCodePoints(0, Math.min(text.codePointCount(0, text.length()) - 1,
                midpointCp + midpointCp / 2));
        int split = -1;
        for (int i = midpointChar; i >= lower; i--) {
            if (text.charAt(i) == '\n' || text.charAt(i) == '\r') {
                split = i + 1;
                break;
            }
        }
        if (split <= 0 || split >= text.length()) {
            for (int i = midpointChar; i <= upper && i < text.length(); i++) {
                if (text.charAt(i) == '\n' || text.charAt(i) == '\r') {
                    split = i + 1;
                    break;
                }
            }
        }
        if (split <= 0 || split >= text.length()) split = midpointChar;
        if (split > 0 && split < text.length() && Character.isHighSurrogate(text.charAt(split - 1))
                && Character.isLowSurrogate(text.charAt(split))) {
            split--;
        }
        if (split <= 0 || split >= text.length()) return List.of();
        return List.of(new TextPart(text.substring(0, split), 0, split),
                new TextPart(text.substring(split), split, text.length()));
    }

    private static DomainException invalidRoute() {
        return new DomainException("MODEL_PROVIDER_ERROR", "Overview plan does not cover the authorized source material");
    }
}
