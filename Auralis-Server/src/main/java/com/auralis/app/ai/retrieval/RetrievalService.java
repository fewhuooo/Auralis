package com.auralis.app.ai.retrieval;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.subject.SubjectService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class RetrievalService {

    private static final int MAX_EXCERPT_CHARS = 400;
    private static final int MAX_QUERY_CHARS = 2048;
    private static final int MAX_CONTENT_SCAN_CHARS = 65_536;
    private static final int MAX_FOCUS_TERMS = 8;
    private static final int MAX_TERM_CHARS = 48;
    private static final int MAX_TERM_OCCURRENCES = 256;
    private static final int EXCERPT_LEADING_CONTEXT_CHARS = 80;
    private static final int CUE_SCAN_CHARS = 64;
    private static final List<String> QUERY_CUES = List.of(
            "的定义", "定义", "的含义", "含义", "是什么意思", "是什么", "指什么",
            "definition of", "meaning of", "what is");
    private static final List<String> QUERY_PREFIXES = List.of(
            "请问", "请", "解释", "说明", "阐述", "介绍", "描述", "关于",
            "explain", "define");
    private static final List<QuotePair> QUOTE_PAIRS = List.of(
            new QuotePair('“', '”'), new QuotePair('‘', '’'), new QuotePair('"', '"'),
            new QuotePair('\'', '\''), new QuotePair('【', '】'), new QuotePair('「', '」'),
            new QuotePair('『', '』'));
    private static final List<EvidenceCue> EVIDENCE_CUES = List.of(
            new EvidenceCue("含义", 2000), new EvidenceCue("定义", 2000),
            new EvidenceCue("definition", 2000), new EvidenceCue("meaning", 2000),
            new EvidenceCue("refers to", 1800), new EvidenceCue("means", 1600),
            new EvidenceCue("是", 1300), new EvidenceCue("指", 1300),
            new EvidenceCue("is", 1200), new EvidenceCue("：", 900),
            new EvidenceCue(":", 900));

    private final SourceChunkRepository chunkRepository;
    private final SourceService sourceService;
    private final PgVectorRetrievalRepository pgVectorRepository;
    private final SubjectService subjectService;
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public RetrievalService(SourceChunkRepository chunkRepository, SourceService sourceService) {
        this(chunkRepository, sourceService, null, null);
    }

    public RetrievalService(
            SourceChunkRepository chunkRepository,
            SourceService sourceService,
            PgVectorRetrievalRepository pgVectorRepository) {
        this(chunkRepository, sourceService, pgVectorRepository, null);
    }

    @Autowired
    public RetrievalService(
            SourceChunkRepository chunkRepository,
            SourceService sourceService,
            PgVectorRetrievalRepository pgVectorRepository,
            SubjectService subjectService) {
        this.chunkRepository = chunkRepository;
        this.sourceService = sourceService;
        this.pgVectorRepository = pgVectorRepository;
        this.subjectService = subjectService;
    }

    public List<Citation> retrieve(UUID userId, List<Double> queryVector, int topK) {
        return retrieve(userId, queryVector, topK, null);
    }

    public List<Citation> retrieve(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext) {
        return retrieve(userId, queryVector, topK, readingContext, null);
    }

    public List<Citation> retrieve(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext,
            String queryText) {
        vectorCodec.validate(queryVector);
        if (topK <= 0) {
            throw new IllegalArgumentException("topK must be positive");
        }
        if (readingContext != null) {
            if (readingContext.retrievalMode() == ReadingContext.RetrievalMode.SELECTED_SOURCES) {
                return retrieveSelectedSources(userId, queryVector, topK, readingContext, queryText);
            }
            if (readingContext.retrievalMode() == ReadingContext.RetrievalMode.SUBJECT) {
                return retrieveSubjectSources(userId, queryVector, topK, readingContext, queryText);
            }
        }
        SourceView currentSource = validateReadingContext(userId, readingContext);
        UUID sourceId = currentSource == null ? null : currentSource.id();
        List<Citation> currentHits = retrieveForSource(userId, queryVector, topK, sourceId, queryText);
        if (currentSource == null || queryText == null || queryText.isBlank()) return currentHits;

        List<SourceView> subjectSources = sourceService.list(userId);
        ScopeEscalationPolicy.Decision decision = ScopeEscalationPolicy.decide(
                queryText, currentSource, subjectSources == null ? List.of() : subjectSources,
                currentHits.size(), ReadingRetrievalConfig.defaults());
        if (!decision.escalated()) return currentHits;

        List<Citation> expanded = new ArrayList<>(currentHits);
        for (UUID targetId : decision.sourceIds()) {
            expanded.addAll(retrieveForSource(userId, queryVector, topK, targetId, queryText));
        }
        return expanded.stream()
                .collect(java.util.stream.Collectors.toMap(
                        citation -> citation.sourceId() + ":" + citation.chunkId(),
                        citation -> citation,
                        (first, ignored) -> first,
                        LinkedHashMap::new))
                .values().stream()
                .limit(topK)
                .toList();
    }

    private List<Citation> retrieveSelectedSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext,
            String queryText) {
        requireActiveSubject(userId, readingContext.subjectId());
        List<UUID> requestedIds = readingContext.sourceIds();
        List<SourceView> requestedSources = requireReadySources(userId, requestedIds, readingContext.subjectId());
        if (readingContext.currentSourceId() != null) {
            SourceView current = sourceService.get(userId, readingContext.currentSourceId());
            if (!readingContext.subjectId().equals(current.subjectId())) {
                throw new DomainException("VALIDATION_FAILED", "readingContext subject does not match the current source");
            }
            requireReady(current);
        }
        return retrieveAcrossSources(userId, queryVector, topK, requestedSources, queryText);
    }

    public List<Citation> retrieveWithinSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            List<UUID> sourceIds,
            UUID subjectId,
            String queryText) {
        vectorCodec.validate(queryVector);
        if (topK <= 0) throw new IllegalArgumentException("topK must be positive");
        if (subjectId != null) requireActiveSubject(userId, subjectId);
        return retrieveAcrossSources(userId, queryVector, topK,
                requireReadySources(userId, sourceIds, subjectId), queryText);
    }

    private List<SourceView> requireReadySources(UUID userId, List<UUID> sourceIds, UUID subjectId) {
        if (sourceIds == null || sourceIds.isEmpty() || sourceIds.size() > 100
                || sourceIds.stream().anyMatch(java.util.Objects::isNull)
                || new LinkedHashSet<>(sourceIds).size() != sourceIds.size()) {
            throw new DomainException("VALIDATION_FAILED", "sourceIds must contain unique source IDs");
        }
        List<SourceView> requestedSources = sourceService.findActiveViewsByIds(userId, sourceIds);
        if (requestedSources.size() != sourceIds.size()) {
            throw new DomainException("RESOURCE_NOT_FOUND", "A selected source was not found");
        }
        for (SourceView source : requestedSources) {
            if (subjectId != null && !subjectId.equals(source.subjectId())) {
                throw new DomainException("VALIDATION_FAILED", "A selected source does not belong to the reading subject");
            }
            requireReady(source);
        }
        return requestedSources;
    }

    private List<Citation> retrieveSubjectSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext,
            String queryText) {
        if (!readingContext.sourceIds().isEmpty() || readingContext.currentSourceId() != null) {
            throw new DomainException("VALIDATION_FAILED", "subject retrieval does not accept source IDs");
        }
        requireActiveSubject(userId, readingContext.subjectId());
        List<SourceView> subjectSources = sourceService.list(userId).stream()
                .filter(source -> readingContext.subjectId().equals(source.subjectId()))
                .filter(source -> source.ingestionStatus() == SourceIngestionStatus.READY)
                .toList();
        return retrieveAcrossSources(userId, queryVector, topK, subjectSources, queryText);
    }

    private void requireActiveSubject(UUID userId, UUID subjectId) {
        if (subjectService == null) {
            throw new IllegalStateException("SubjectService is required for scoped retrieval");
        }
        subjectService.get(userId, subjectId);
    }

    private List<Citation> retrieveAcrossSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            List<SourceView> sources,
            String queryText) {
        Map<String, Citation> unique = new LinkedHashMap<>();
        for (SourceView source : sources) {
            for (Citation citation : retrieveForSource(userId, queryVector, topK, source.id(), queryText)) {
                unique.putIfAbsent(citation.sourceId() + ":" + citation.chunkId(), citation);
            }
        }
        return unique.values().stream()
                .sorted(Comparator.comparingDouble(Citation::similarity).reversed()
                        .thenComparing(Citation::sourceId)
                        .thenComparing(Citation::chunkId))
                .limit(topK)
                .toList();
    }

    private void requireReady(SourceView source) {
        if (source.ingestionStatus() != SourceIngestionStatus.READY) {
            throw new DomainException("SOURCE_NOT_READY", "A selected source is not ready for AI retrieval");
        }
    }

    private List<Citation> retrieveForSource(
            UUID userId, List<Double> queryVector, int topK, UUID sourceId, String queryText) {
        if (pgVectorRepository != null) {
            Optional<List<PgVectorRetrievalRepository.PgVectorChunk>> databaseResults =
                    sourceId == null
                            ? pgVectorRepository.search(userId, queryVector, topK)
                            : pgVectorRepository.search(userId, sourceId, queryVector, topK);
            if (databaseResults.isPresent()) {
                List<PgVectorRetrievalRepository.PgVectorChunk> hits = databaseResults.get();
                Map<UUID, SourceView> sources = activeSourcesById(userId,
                        hits.stream().map(PgVectorRetrievalRepository.PgVectorChunk::sourceId).collect(Collectors.toSet()));
                return hits.stream()
                        .filter(chunk -> sources.containsKey(chunk.sourceId()))
                        .map(chunk -> citation(chunk, sources.get(chunk.sourceId()), queryText))
                        .toList();
            }
        }
        List<SourceChunkEntity> chunks = chunkRepository.findAllByUserIdAndActiveTrue(userId).stream()
                .filter(chunk -> sourceId == null || sourceId.equals(chunk.getSourceId()))
                .toList();
        Map<UUID, SourceView> sources = activeSourcesById(userId,
                chunks.stream().map(SourceChunkEntity::getSourceId).collect(Collectors.toSet()));
        return chunks.stream()
                .filter(chunk -> sources.containsKey(chunk.getSourceId()))
                .map(chunk -> scored(chunk, queryVector))
                .filter(scored -> scored.similarity() > 0)
                .sorted(Comparator.comparingDouble(ScoredChunk::similarity).reversed()
                        .thenComparing(scored -> scored.chunk().getId()))
                .limit(topK)
                .map(scored -> citation(scored.chunk(), sources.get(scored.chunk().getSourceId()),
                        scored.similarity(), queryText))
                .toList();
    }

    private Map<UUID, SourceView> activeSourcesById(UUID userId, Set<UUID> sourceIds) {
        if (sourceIds.isEmpty()) {
            return Map.of();
        }
        return sourceService.findActiveViewsByIds(userId, sourceIds).stream()
                .collect(Collectors.toMap(SourceView::id, source -> source, (first, ignored) -> first,
                        LinkedHashMap::new));
    }

    private SourceView validateReadingContext(UUID userId, ReadingContext readingContext) {
        if (readingContext == null) return null;
        if (readingContext.currentSourceId() == null) {
            throw new DomainException("VALIDATION_FAILED", "readingContext.currentSourceId is required");
        }
        SourceView source = sourceService.get(userId, readingContext.currentSourceId());
        if (readingContext.subjectId() != null && !readingContext.subjectId().equals(source.subjectId())) {
            throw new DomainException("VALIDATION_FAILED", "readingContext subject does not match the source");
        }
        if (source.ingestionStatus() != SourceIngestionStatus.READY) {
            throw new DomainException("SOURCE_NOT_READY", "The current source is not ready for AI retrieval");
        }
        return source;
    }

    private ScoredChunk scored(SourceChunkEntity chunk, List<Double> query) {
        List<Double> vector = vectorCodec.decode(chunk.getEmbeddingJson());
        double dot = 0;
        double queryNorm = 0;
        double vectorNorm = 0;
        for (int index = 0; index < query.size(); index++) {
            double queryValue = query.get(index);
            double vectorValue = vector.get(index);
            dot += queryValue * vectorValue;
            queryNorm += queryValue * queryValue;
            vectorNorm += vectorValue * vectorValue;
        }
        double similarity = queryNorm == 0 || vectorNorm == 0
                ? 0
                : dot / (Math.sqrt(queryNorm) * Math.sqrt(vectorNorm));
        return new ScoredChunk(chunk, similarity);
    }

    private Citation citation(SourceChunkEntity chunk, SourceView source, double similarity, String queryText) {
        return new Citation(
                chunk.getSourceId(), chunk.getId(), chunk.getOrdinal(), source.title(),
                excerpt(chunk.getContent(), queryText), similarity);
    }

    private Citation citation(PgVectorRetrievalRepository.PgVectorChunk chunk, SourceView source, String queryText) {
        return new Citation(
                chunk.sourceId(), chunk.id(), chunk.ordinal(), source.title(), excerpt(chunk.content(), queryText),
                chunk.similarity());
    }

    private String excerpt(String content, String queryText) {
        if (content == null || content.isEmpty()) return content;
        if (content.length() <= MAX_EXCERPT_CHARS) return content;

        FocusMatch match = findBestFocusMatch(content, extractFocusTerms(queryText));
        if (match == null) return safeExcerptWindow(content, 0);
        return safeExcerptWindow(content, match.offset());
    }

    private List<String> extractFocusTerms(String queryText) {
        if (queryText == null || queryText.isBlank()) return List.of();
        String query = queryText.length() <= MAX_QUERY_CHARS
                ? queryText
                : queryText.substring(0, MAX_QUERY_CHARS);
        LinkedHashSet<String> terms = new LinkedHashSet<>();

        for (QuotePair pair : QUOTE_PAIRS) {
            int cursor = 0;
            while (cursor < query.length() && terms.size() < MAX_FOCUS_TERMS) {
                int opening = query.indexOf(pair.open(), cursor);
                if (opening < 0) break;
                int closing = query.indexOf(pair.close(), opening + 1);
                if (closing < 0) break;
                addFocusTerm(terms, query.substring(opening + 1, closing));
                cursor = closing + 1;
            }
            if (terms.size() >= MAX_FOCUS_TERMS) break;
        }

        for (String cue : QUERY_CUES) {
            int cursor = 0;
            while (cursor < query.length() && terms.size() < MAX_FOCUS_TERMS) {
                int cueIndex = indexOfIgnoreCase(query, cue, cursor, query.length());
                if (cueIndex < 0) break;
                int end = cueIndex;
                int start = Math.max(0, end - MAX_TERM_CHARS - 16);
                while (start < end && isQueryBoundary(query.charAt(start))) start++;
                String candidate = query.substring(start, end).trim();
                if (cue.equals("definition of") || cue.equals("meaning of") || cue.equals("what is")) {
                    int after = cueIndex + cue.length();
                    int limit = after;
                    while (limit < query.length() && limit - after < MAX_TERM_CHARS
                            && !isQueryBoundary(query.charAt(limit))) limit++;
                    addFocusTerm(terms, query.substring(after, limit));
                } else {
                    if (candidate.endsWith("的")) candidate = candidate.substring(0, candidate.length() - 1);
                    for (String prefix : QUERY_PREFIXES) {
                        if (candidate.regionMatches(true, 0, prefix, 0, prefix.length())) {
                            candidate = candidate.substring(prefix.length()).trim();
                        }
                    }
                    addFocusTerm(terms, candidate);
                }
                cursor = cueIndex + cue.length();
            }
            if (terms.size() >= MAX_FOCUS_TERMS) break;
        }
        return List.copyOf(terms);
    }

    private void addFocusTerm(Set<String> terms, String candidate) {
        String term = candidate == null ? "" : candidate.trim();
        while (term.length() > MAX_TERM_CHARS) {
            term = term.substring(term.length() - MAX_TERM_CHARS);
        }
        if (!term.isEmpty() && !term.isBlank()) terms.add(term);
    }

    private FocusMatch findBestFocusMatch(String content, List<String> focusTerms) {
        if (focusTerms.isEmpty()) return null;
        int scanLimit = Math.min(content.length(), MAX_CONTENT_SCAN_CHARS);
        FocusMatch best = null;
        for (String term : focusTerms) {
            if (term.length() > MAX_TERM_CHARS) continue;
            int occurrences = 0;
            for (int offset = 0; offset <= scanLimit - term.length()
                    && occurrences < MAX_TERM_OCCURRENCES; offset++) {
                if (!content.regionMatches(true, offset, term, 0, term.length())) continue;
                occurrences++;
                int score = evidenceCueScore(content, offset, term.length(), scanLimit);
                if (best == null || score > best.score()) best = new FocusMatch(offset, score);
            }
        }
        return best;
    }

    private int evidenceCueScore(String content, int offset, int termLength, int scanLimit) {
        int bestScore = 0;
        int afterStart = offset + termLength;
        int afterEnd = Math.min(scanLimit, afterStart + CUE_SCAN_CHARS);
        for (EvidenceCue cue : EVIDENCE_CUES) {
            int cueIndex = indexOfIgnoreCase(content, cue.text(), afterStart, afterEnd);
            if (cueIndex >= 0 && !hasSentenceBoundary(content, afterStart, cueIndex)) {
                bestScore = Math.max(bestScore, cue.weight() - (cueIndex - afterStart));
            }
            int beforeStart = Math.max(0, offset - CUE_SCAN_CHARS);
            int previousCue = lastIndexOfIgnoreCase(content, cue.text(), beforeStart, offset);
            if (previousCue >= 0 && !hasSentenceBoundary(content, previousCue + cue.text().length(), offset)) {
                bestScore = Math.max(bestScore, cue.weight() - (offset - previousCue));
            }
        }
        return bestScore;
    }

    private String safeExcerptWindow(String content, int focusOffset) {
        int start = Math.max(0, focusOffset - EXCERPT_LEADING_CONTEXT_CHARS);
        if (start > 0 && Character.isLowSurrogate(content.charAt(start))
                && Character.isHighSurrogate(content.charAt(start - 1))) {
            start--;
        }
        if (content.length() - start < MAX_EXCERPT_CHARS) {
            start = Math.max(0, content.length() - MAX_EXCERPT_CHARS);
            if (start > 0 && Character.isLowSurrogate(content.charAt(start))
                    && Character.isHighSurrogate(content.charAt(start - 1))) {
                start--;
            }
        }
        int end = Math.min(content.length(), start + MAX_EXCERPT_CHARS);
        if (end < content.length() && end > start && Character.isHighSurrogate(content.charAt(end - 1))
                && Character.isLowSurrogate(content.charAt(end))) {
            end--;
        }
        return content.substring(start, end);
    }

    private int indexOfIgnoreCase(String value, String needle, int from, int to) {
        int end = Math.min(value.length(), to);
        int lastStart = end - needle.length();
        for (int index = Math.max(0, from); index <= lastStart; index++) {
            if (value.regionMatches(true, index, needle, 0, needle.length())) return index;
        }
        return -1;
    }

    private int lastIndexOfIgnoreCase(String value, String needle, int from, int to) {
        int start = Math.min(value.length() - needle.length(), to - needle.length());
        for (int index = start; index >= Math.max(0, from); index--) {
            if (value.regionMatches(true, index, needle, 0, needle.length())) return index;
        }
        return -1;
    }

    private boolean hasSentenceBoundary(String value, int from, int to) {
        for (int index = Math.max(0, from); index < Math.min(value.length(), to); index++) {
            char character = value.charAt(index);
            if (character == '.' || character == '。' || character == '!' || character == '！'
                    || character == '?' || character == '？' || character == ';' || character == '；'
                    || character == ',' || character == '，') return true;
        }
        return false;
    }

    private boolean isQueryBoundary(char character) {
        return character == '，' || character == ',' || character == '。' || character == '.'
                || character == '；' || character == ';' || character == '！' || character == '!'
                || character == '？' || character == '?' || character == '\n' || character == '\r';
    }

    private record QuotePair(char open, char close) {
    }

    private record EvidenceCue(String text, int weight) {
    }

    private record FocusMatch(int offset, int score) {
    }

    private record ScoredChunk(SourceChunkEntity chunk, double similarity) {
    }
}
