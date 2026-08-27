package com.auralis.app.ai.retrieval;

import com.auralis.app.source.SourceView;

import java.text.Normalizer;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Pure, non-LLM policy for expanding a reading query within its subject. */
public final class ScopeEscalationPolicy {

    private static final Pattern NON_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Set<String> SHORT_TITLE_STOP_WORDS = Set.of(
            "file", "document", "pdf", "doc", "ppt", "文件", "资料", "文档", "讲义", "课件");
    private static final Pattern EXPLICIT_COMPARE = Pattern.compile(
            "(?i)(compare|comparison|versus|\\bvs\\.?\\b|对比|比较|相比|区别|不同|另一个文件|其他文件|other file|another file)");

    private ScopeEscalationPolicy() {
    }

    public static Decision decide(
            String query,
            SourceView currentSource,
            List<SourceView> subjectSources,
            int currentResultCount,
            ReadingRetrievalConfig config) {
        if (currentSource == null || currentSource.id() == null || subjectSources == null || subjectSources.isEmpty()) {
            return Decision.none();
        }
        ReadingRetrievalConfig thresholds = config == null ? ReadingRetrievalConfig.defaults() : config;
        String normalizedQuery = normalize(query);
        List<SourceView> candidates = subjectSources.stream()
                .filter(source -> source != null && source.id() != null)
                .filter(source -> !source.id().equals(currentSource.id()))
                .filter(source -> source.subjectId() != null && source.subjectId().equals(currentSource.subjectId()))
                .limit(thresholds.maximumSubjectSources())
                .toList();
        if (candidates.isEmpty()) return Decision.none();

        List<SourceView> mentioned = candidates.stream()
                .filter(source -> titleMatches(normalizedQuery, source.title(), thresholds.minimumTitleLength()))
                .toList();
        if (EXPLICIT_COMPARE.matcher(query == null ? "" : query).find()) {
            List<UUID> targetIds = (mentioned.isEmpty() ? candidates : mentioned).stream().map(SourceView::id).toList();
            return new Decision(ScopeEscalationReason.EXPLICIT_CROSS_FILE, targetIds);
        }
        if (!mentioned.isEmpty()) {
            return new Decision(ScopeEscalationReason.SUBJECT_SOURCE_TITLE_MATCH,
                    mentioned.stream().map(SourceView::id).toList());
        }
        if (currentResultCount < thresholds.minimumCurrentResults()) {
            return new Decision(ScopeEscalationReason.INSUFFICIENT_CURRENT_RESULTS,
                    candidates.stream().map(SourceView::id).toList());
        }
        return Decision.none();
    }

    static boolean titleMatches(String normalizedQuery, String title, int minimumTitleLength) {
        String normalizedTitle = normalize(title);
        return normalizedTitle.length() >= minimumTitleLength
                && !SHORT_TITLE_STOP_WORDS.contains(normalizedTitle)
                && normalizedQuery.contains(normalizedTitle);
    }

    static String normalize(String value) {
        if (value == null) return "";
        String decomposed = Normalizer.normalize(value.trim().toLowerCase(), Normalizer.Form.NFKC);
        return NON_WORD.matcher(decomposed).replaceAll("");
    }

    public record Decision(ScopeEscalationReason reason, List<UUID> sourceIds) {
        public Decision {
            sourceIds = sourceIds == null ? List.of() : List.copyOf(sourceIds);
        }

        static Decision none() {
            return new Decision(null, List.of());
        }

        public boolean escalated() {
            return reason != null && !sourceIds.isEmpty();
        }
    }
}
