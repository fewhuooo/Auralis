package com.auralis.app;

import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.EmbeddingVectorCodec;
import com.auralis.app.ai.retrieval.PgVectorRetrievalRepository;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.SourceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.auralis.app.subject.SubjectService;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiRetrievalTests {

    @Mock
    private SourceChunkRepository chunkRepository;

    @Mock
    private SourceService sourceService;

    @Mock
    private PgVectorRetrievalRepository pgVectorRepository;

    @Mock
    private SubjectService subjectService;

    @InjectMocks
    private RetrievalService retrievalService;

    @Test
    void retrievalIsUserScopedAndReturnsSourceCitations() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<Double> vector = vector(1.0, 0.0);
        SourceChunkEntity chunk = new SourceChunkEntity(
                chunkId, userId, sourceId, 0, "matching excerpt", "hash", 0, 16,
                new EmbeddingVectorCodec().encode(vector), UUID.randomUUID(), true);
        when(pgVectorRepository.search(userId, List.of(sourceId), vector, 3)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(chunk));
        when(sourceService.findActiveViewsByIds(userId, List.of(sourceId))).thenReturn(List.of(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "My source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null)));

        List<Citation> citations = retrievalService.retrieveWithinSources(userId, vector, 3, List.of(sourceId), null, null);

        assertThat(citations).hasSize(1);
        assertThat(citations.get(0).sourceId()).isEqualTo(sourceId);
        assertThat(citations.get(0).title()).isEqualTo("My source");
        assertThat(citations.get(0).excerpt()).isEqualTo("matching excerpt");
        assertThat(citations.get(0).similarity()).isEqualTo(1.0);
        verify(chunkRepository).findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId);
    }

    @Test
    void postgresRetrievalUsesDatabaseSimilarityAndSkipsJavaScan() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<Double> vector = vector(1.0, 0.0);
        when(pgVectorRepository.search(userId, List.of(sourceId), vector, 3)).thenReturn(Optional.of(List.of(
                new PgVectorRetrievalRepository.PgVectorChunk(
                        chunkId, sourceId, 0, "database excerpt", 0, 16, 0.98))));
        when(sourceService.findActiveViewsByIds(userId, List.of(sourceId))).thenReturn(List.of(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "Database source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null)));

        List<Citation> citations = retrievalService.retrieveWithinSources(userId, vector, 3, List.of(sourceId), null, null);

        assertThat(citations).singleElement().satisfies(citation -> {
            assertThat(citation.chunkId()).isEqualTo(chunkId);
            assertThat(citation.similarity()).isEqualTo(0.98);
        });
        verify(chunkRepository, never()).findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId);
    }

    @Test
    void rejectsInvalidDimensionsAndTopK() {
        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(UUID.randomUUID(), List.of(1.0), 3,
                List.of(UUID.randomUUID()), null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(UUID.randomUUID(), vector(1.0, 0.0), 0,
                List.of(UUID.randomUUID()), null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void retrievesOnlyRequestedSourcesAndPreservesQueryFocus() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        UUID unselectedId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        SourceView first = source(firstId, subjectId, "First", SourceIngestionStatus.READY);
        SourceView second = source(secondId, subjectId, "Second", SourceIngestionStatus.READY);
        String firstContent = "Background. ".repeat(60) + "compiler pass: a single traversal.";
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, firstId))
                .thenReturn(List.of(chunk(userId, firstId, firstContent, query)));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, secondId))
                .thenReturn(List.of(chunk(userId, secondId, "second hit", query)));
        when(sourceService.findActiveViewsByIds(userId, List.of(firstId, secondId)))
                .thenReturn(List.of(first, second));

        List<Citation> citations = retrievalService.retrieveWithinSources(userId, query, 3,
                List.of(firstId, secondId), subjectId, "Compare the “compiler pass” definition across selected files.");

        assertThat(citations).extracting(Citation::sourceId).containsExactlyInAnyOrder(firstId, secondId);
        assertThat(citations).filteredOn(citation -> firstId.equals(citation.sourceId())).singleElement()
                .satisfies(citation -> assertThat(citation.excerpt()).contains("compiler pass: a single traversal."));
        verify(sourceService, never()).list(userId);
        verify(chunkRepository, never()).findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, unselectedId);
    }

    @Test
    void selectedSourceScopeRejectsCrossSubjectSourcesBeforeSearching() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID foreignSubjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        when(sourceService.findActiveViewsByIds(userId, List.of(sourceId)))
                .thenReturn(List.of(source(sourceId, foreignSubjectId, "Foreign", SourceIngestionStatus.READY)));

        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(userId, query, 3,
                List.of(sourceId), subjectId, null))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("reading subject");
        verify(pgVectorRepository, never()).search(userId, List.of(sourceId), query, 3);
    }

    @Test
    void selectedSourceScopeRejectsSourcesThatAreMissingOrNotReady() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID missingId = UUID.randomUUID();
        UUID pendingId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        when(sourceService.findActiveViewsByIds(userId, List.of(missingId))).thenReturn(List.of());
        when(sourceService.findActiveViewsByIds(userId, List.of(pendingId)))
                .thenReturn(List.of(source(pendingId, subjectId, "Pending", SourceIngestionStatus.PENDING)));

        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(userId, query, 3,
                List.of(missingId), subjectId, null))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("selected source was not found");
        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(userId, query, 3,
                List.of(pendingId), subjectId, null))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("not ready");
        verify(pgVectorRepository, never()).search(userId, List.of(pendingId), query, 3);
    }

    @Test
    void queryAwareExcerptIncludesLateSingleCharacterDefinition() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        String definition = "1.3.6 遍\n遍\n含义：对源语言程序从头到尾扫描并完成规定任务的过程。";
        String content = "普遍情况与遍历操作。" + "前置说明。".repeat(85) + "\n" + definition
                + "\n后续材料。".repeat(60);
        assertThat(content.indexOf("含义：")).isGreaterThan(400);
        SourceChunkEntity chunk = new SourceChunkEntity(
                chunkId, userId, sourceId, 6, content, "hash", 0, content.length(),
                new EmbeddingVectorCodec().encode(query), UUID.randomUUID(), true);
        when(pgVectorRepository.search(userId, List.of(sourceId), query, 8)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(chunk));
        when(sourceService.findActiveViewsByIds(userId, List.of(sourceId))).thenReturn(List.of(
                source(sourceId, subjectId, "Compiler notes", SourceIngestionStatus.READY)));

        String question = "解释遍的定义、适用条件和例外；资料未明确写出的请说明未写。";
        List<Citation> citations = retrievalService.retrieveWithinSources(userId, query, 8, List.of(sourceId), subjectId, question);

        assertThat(citations).singleElement().satisfies(citation -> {
            assertThat(citation.sourceId()).isEqualTo(sourceId);
            assertThat(citation.chunkId()).isEqualTo(chunkId);
            assertThat(citation.excerpt()).contains("1.3.6 遍", "含义：", "对源语言程序");
            assertThat(citation.excerpt()).hasSizeLessThanOrEqualTo(400);
            assertThat(content).contains(citation.excerpt());
        });
    }

    @Test
    void quotedChineseAndEnglishTermsSelectBoundedEvidenceWindows() {
        assertQueryExcerptContains("请解释“循环不变量”的含义。",
                "普通说明。".repeat(60) + "循环不变量：每次迭代前后保持为真的性质。" + "尾部说明。".repeat(60),
                "循环不变量：", "保持为真的性质");
        assertQueryExcerptContains("What does ‘compiler pass’ mean?",
                "Background. ".repeat(70) + "A compiler pass is one traversal of an intermediate program. "
                        + "Later notes. ".repeat(50),
                "A compiler pass is", "one traversal");
    }

    @Test
    void repeatedFocusUsesDefinitionOccurrenceInsteadOfEarlierNoise() {
        assertQueryExcerptContains("解释遍的定义。",
                "普遍观点与遍历步骤。".repeat(40) + "\n1.3.6 遍\n遍\n含义：定义段内容。",
                "1.3.6 遍", "含义：定义段内容");
    }

    @Test
    void absentFocusFallsBackToPrefixAndEmptyOrShortContentKeepsExistingBounds() {
        String content = "prefix 文本。".repeat(60);
        assertQueryExcerptContains("解释没有出现的术语。", content, "prefix 文本。", null);
        assertThat(retrieveExcerpt("", content)).startsWith("prefix 文本。");
        assertThat(retrieveExcerpt(null, content)).startsWith("prefix 文本。");
        assertThat(retrieveExcerpt("无关问题", "short 文本")).isEqualTo("short 文本");
        assertThat(retrieveExcerpt("短文本的定义", "短文本的定义：完整内容。"))
                .isEqualTo("短文本的定义：完整内容。");
        assertThat(retrieveExcerpt("术语", "")).isEmpty();
    }

    @Test
    void excerptNeverExceedsFourHundredJavaCharactersOrSplitsSurrogatePairs() {
        String content = "x".repeat(399) + "😀" + "后续".repeat(30);
        String excerpt = retrieveExcerpt("没有匹配词", content);
        assertThat(excerpt.length()).isLessThanOrEqualTo(400);
        assertThat(excerpt.length() == 0 || !Character.isHighSurrogate(excerpt.charAt(excerpt.length() - 1)))
                .isTrue();
        assertThat(excerpt.length() < 2 || !Character.isHighSurrogate(excerpt.charAt(excerpt.length() - 2))
                || !Character.isLowSurrogate(excerpt.charAt(excerpt.length() - 1))).isTrue();
    }

    private void assertQueryExcerptContains(String question, String content, String expected, String additional) {
        String excerpt = retrieveExcerpt(question, content);
        assertThat(excerpt).contains(expected);
        if (additional != null) assertThat(excerpt).contains(additional);
        assertThat(excerpt).hasSizeLessThanOrEqualTo(400);
    }

    private String retrieveExcerpt(String question, String content) {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        SourceChunkEntity chunk = new SourceChunkEntity(
                chunkId, userId, sourceId, 0, content, "hash-" + UUID.randomUUID(), 0, content.length(),
                new EmbeddingVectorCodec().encode(query), UUID.randomUUID(), true);
        when(pgVectorRepository.search(userId, List.of(sourceId), query, 8)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(chunk));
        when(sourceService.findActiveViewsByIds(userId, List.of(sourceId))).thenReturn(List.of(
                source(sourceId, subjectId, "Evidence", SourceIngestionStatus.READY)));
        List<Citation> citations = retrievalService.retrieveWithinSources(userId, query, 8, List.of(sourceId), subjectId, question);
        assertThat(citations).hasSize(1);
        return citations.get(0).excerpt();
    }

    @Test
    void selectedSourceScopeOwnerChecksSubjectBeforeLoadingSelectedSources() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        when(subjectService.requireActiveSubject(userId, subjectId)).thenThrow(
                new com.auralis.app.shared.error.DomainException("RESOURCE_NOT_FOUND", "Subject was not found"));

        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(userId, vector(1.0, 0.0), 3,
                List.of(UUID.randomUUID()), subjectId, null))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("Subject was not found");
        verify(sourceService, never()).findActiveViewsByIds(eq(userId), anyCollection());
    }

    private static SourceView source(UUID id, UUID subjectId, String title, SourceIngestionStatus status) {
        return new SourceView(id, subjectId, SourceType.FILE, title, null, null, null, null,
                status, null, null, 1, Instant.now(), Instant.now(), null);
    }

    private static SourceChunkEntity chunk(UUID userId, UUID sourceId, String content, List<Double> vector) {
        return new SourceChunkEntity(
                UUID.randomUUID(), userId, sourceId, 0, content, "hash-" + content, 0, content.length(),
                new EmbeddingVectorCodec().encode(vector), UUID.randomUUID(), true);
    }

    private static List<Double> vector(double first, double second) {
        List<Double> vector = new ArrayList<>(java.util.Collections.nCopies(1024, 0.0));
        vector.set(0, first);
        vector.set(1, second);
        return vector;
    }
}
