package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.OverviewResultService;
import com.auralis.app.ai.OverviewResultView;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.retrieval.PgVectorRetrievalRepository;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.anyMap;

class ChatReadToolsCatalogTests {
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID SUBJECT_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SourceService sources = mock(SourceService.class);
    private final SubjectService subjects = mock(SubjectService.class);
    private final OverviewResultService overviews = mock(OverviewResultService.class);
    private final ChatReadTools tools = new ChatReadTools(null, objectMapper, null, sources, null, subjects,
            null, ChatAgentProperties.defaults(), overviews);

    @BeforeEach
    void defaultOverviewLookup() {
        when(overviews.currentSourceOverviewIds(eq(USER_ID), anyMap())).thenReturn(java.util.Set.of());
    }

    @Test
    void catalogPaginatesOnlyTheCapturedSubjectReadySnapshotWithoutPerSourceQueries() throws Exception {
        SourceView first = source("00000000-0000-0000-0000-000000000011", SUBJECT_ID,
                "Mechanics", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000101");
        SourceView second = source("00000000-0000-0000-0000-000000000012", SUBJECT_ID,
                "Optics", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000102");
        SourceView processing = source("00000000-0000-0000-0000-000000000013", SUBJECT_ID,
                "In progress", SourceIngestionStatus.PENDING, "00000000-0000-0000-0000-000000000103");
        SourceView otherSubject = source("00000000-0000-0000-0000-000000000014", UUID.randomUUID(),
                "Other subject", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000104");
        when(sources.list(USER_ID)).thenReturn(List.of(second, otherSubject, processing, first));
        when(sources.findActiveViewsByIds(USER_ID, List.of(first.id(), second.id())))
                .thenReturn(List.of(first, second));
        when(overviews.currentSourceOverviewIds(eq(USER_ID), anyMap())).thenReturn(java.util.Set.of(first.id()));
        ChatReadTools.ReadScope scope = tools.begin(USER_ID,
                new ReadingContext(null, SUBJECT_ID, ReadingContext.RetrievalMode.SUBJECT, List.of()));

        JsonNode firstPage = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.LIST_SOURCES,
                "{\"limit\":1}"));
        JsonNode secondPage = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.LIST_SOURCES,
                "{\"offset\":1,\"limit\":1}"));

        assertThat(firstPage.path("total").intValue()).isEqualTo(2);
        assertThat(firstPage.path("items").get(0).path("sourceId").textValue()).isEqualTo(first.id().toString());
        assertThat(firstPage.path("items").get(0).path("revision").textValue()).isEqualTo(first.ingestionRevision().toString());
        assertThat(firstPage.path("items").get(0).path("title").textValue()).isEqualTo("Mechanics");
        assertThat(firstPage.path("items").get(0).path("hasOverview").booleanValue()).isTrue();
        assertThat(secondPage.path("items").get(0).path("hasOverview").booleanValue()).isFalse();
        assertThat(firstPage.toString()).doesNotContain("raw text is not included", "outline is not included");
        assertThat(firstPage.path("hasMore").booleanValue()).isTrue();
        assertThat(firstPage.path("nextOffset").intValue()).isEqualTo(1);
        assertThat(secondPage.path("items").get(0).path("sourceId").textValue()).isEqualTo(second.id().toString());
        assertThat(secondPage.path("hasMore").booleanValue()).isFalse();
        assertThat(secondPage.path("nextOffset").isNull()).isTrue();
        verify(sources, times(4)).findActiveViewsByIds(USER_ID, List.of(first.id(), second.id()));
        verify(sources, times(1)).list(USER_ID);
        verify(overviews, times(2)).currentSourceOverviewIds(eq(USER_ID), anyMap());
    }

    @Test
    void catalogCannotExpandAnExplicitlySelectedSourceScope() throws Exception {
        SourceView selected = source("00000000-0000-0000-0000-000000000021", SUBJECT_ID,
                "Selected", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000201");
        SourceView unselected = source("00000000-0000-0000-0000-000000000022", SUBJECT_ID,
                "Unselected", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000202");
        when(sources.list(USER_ID)).thenReturn(List.of(selected, unselected));
        when(sources.findActiveViewsByIds(USER_ID, List.of(selected.id()))).thenReturn(List.of(selected));
        ChatReadTools.ReadScope scope = tools.begin(USER_ID,
                new ReadingContext(null, SUBJECT_ID, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(selected.id())));

        JsonNode result = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.LIST_SOURCES, "{}"));

        assertThat(result.path("total").intValue()).isEqualTo(1);
        assertThat(result.path("items").get(0).path("sourceId").textValue()).isEqualTo(selected.id().toString());
        assertThat(result.toString()).doesNotContain(unselected.id().toString());
    }

    @Test
    void autoModeWithCurrentSourceStillListsOnlyThatSource() throws Exception {
        SourceView current = source("00000000-0000-0000-0000-000000000025", SUBJECT_ID,
                "Current", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000205");
        SourceView adjacent = source("00000000-0000-0000-0000-000000000026", SUBJECT_ID,
                "Adjacent", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000206");
        when(sources.list(USER_ID)).thenReturn(List.of(current, adjacent));
        when(sources.findActiveViewsByIds(USER_ID, List.of(current.id()))).thenReturn(List.of(current));
        ChatReadTools.ReadScope scope = tools.begin(USER_ID,
                new ReadingContext(current.id(), SUBJECT_ID, ReadingContext.RetrievalMode.AUTO, List.of()));

        JsonNode result = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.LIST_SOURCES, "{}"));

        assertThat(result.path("total").intValue()).isEqualTo(1);
        assertThat(result.path("items").get(0).path("sourceId").textValue()).isEqualTo(current.id().toString());
        assertThat(result.toString()).doesNotContain(adjacent.id().toString());
    }

    @Test
    void subjectModeRejectsCurrentOrSelectedSourceOverrides() {
        UUID currentSourceId = UUID.randomUUID();
        assertThatThrownBy(() -> tools.begin(USER_ID,
                new ReadingContext(currentSourceId, SUBJECT_ID, ReadingContext.RetrievalMode.SUBJECT, List.of())))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> tools.begin(USER_ID,
                new ReadingContext(null, SUBJECT_ID, ReadingContext.RetrievalMode.SUBJECT,
                        List.of(currentSourceId))))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void catalogRejectsInvalidParametersAndPropagatesRevisionChanges() {
        SourceView source = source("00000000-0000-0000-0000-000000000031", SUBJECT_ID,
                "Source", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000301");
        when(sources.list(USER_ID)).thenReturn(List.of(source));
        ChatReadTools.ReadScope scope = tools.begin(USER_ID,
                new ReadingContext(null, SUBJECT_ID, ReadingContext.RetrievalMode.SUBJECT, List.of()));

        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.LIST_SOURCES, "{\"limit\":21}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.LIST_SOURCES, "{\"limit\":}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");

        SourceView changed = source(source.id().toString(), SUBJECT_ID,
                source.title(), SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000399");
        when(sources.findActiveViewsByIds(USER_ID, List.of(source.id()))).thenReturn(List.of(changed));
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.LIST_SOURCES, "{}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("SOURCE_SCOPE_CHANGED");
    }

    @Test
    void toolDefinitionExposesBoundedPagination() {
        assertThat(DisplayToolRegistry.isKnown(ChatReadTools.LIST_SOURCES)).isTrue();
        assertThat(tools.definitions()).filteredOn(definition -> definition.name().equals(ChatReadTools.LIST_SOURCES))
                .singleElement().satisfies(definition -> {
            assertThat(definition.description()).contains("目录仅包含资料信息，不代表已阅读资料正文", "read_source_overview",
                    "read_source_excerpt", "search.sourceIds");
            assertThat(definition.schemaJson()).contains("\"maximum\":20", "\"additionalProperties\":false");
        });
        assertThat(tools.definitions()).filteredOn(definition -> definition.name().equals(ChatReadTools.SEARCH))
                .singleElement().satisfies(definition -> {
            assertThat(definition.schemaJson()).contains("\"sourceIds\"", "\"maxItems\":100",
                    "\"uniqueItems\":true", "\"additionalProperties\":false");
        });
    }

    @Test
    void sourceOverviewPaginatesSavedMarkdownByUnicodeCodePointAndPinsVersion() throws Exception {
        SourceView source = source("00000000-0000-0000-0000-000000000051", SUBJECT_ID,
                "Saved", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000501");
        when(sources.list(USER_ID)).thenReturn(List.of(source));
        when(sources.requireActiveSource(USER_ID, source.id())).thenReturn(source);
        when(sources.findActiveViewsByIds(USER_ID, List.of(source.id()))).thenReturn(List.of(source));
        when(overviews.readCurrentSource(USER_ID, source.id(), source.ingestionRevision()))
                .thenReturn(Optional.of(savedOverview(source)));
        ChatReadTools.ReadScope scope = tools.begin(USER_ID, null);

        JsonNode first = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.READ_SOURCE_OVERVIEW,
                "{\"sourceId\":\"" + source.id() + "\",\"limit\":18}"));
        int nextOffset = first.path("nextOffset").intValue();
        JsonNode second = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.READ_SOURCE_OVERVIEW,
                "{\"sourceId\":\"" + source.id() + "\",\"offset\":" + nextOffset
                        + ",\"overviewVersion\":7}"));
        JsonNode stale = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.READ_SOURCE_OVERVIEW,
                "{\"sourceId\":\"" + source.id() + "\",\"offset\":" + nextOffset
                        + ",\"overviewVersion\":8}"));

        assertThat(first.path("status").textValue()).isEqualTo("AVAILABLE");
        assertThat(first.path("overviewVersion").longValue()).isEqualTo(7);
        assertThat(first.path("overview").textValue().codePointCount(0, first.path("overview").textValue().length()))
                .isEqualTo(18);
        assertThat(first.path("hasMore").booleanValue()).isTrue();
        assertThat(second.path("overviewVersion").longValue()).isEqualTo(7);
        assertThat(first.path("overview").textValue() + second.path("overview").textValue())
                .contains("概述🌿", "### Key points", "## Outline", "**小节**: 细节");
        assertThat(stale.path("status").textValue()).isEqualTo("STALE");
        assertThat(stale.path("overview").textValue()).isEmpty();
        verify(overviews, times(3)).readCurrentSource(USER_ID, source.id(), source.ingestionRevision());
    }

    @Test
    void missingSourceOverviewIsNormalAndOutsideScopeNeverReadsIt() throws Exception {
        SourceView selected = source("00000000-0000-0000-0000-000000000061", SUBJECT_ID,
                "Selected", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000601");
        SourceView outside = source("00000000-0000-0000-0000-000000000062", SUBJECT_ID,
                "Outside", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000602");
        when(sources.list(USER_ID)).thenReturn(List.of(selected, outside));
        when(sources.requireActiveSource(USER_ID, selected.id())).thenReturn(selected);
        when(sources.findActiveViewsByIds(USER_ID, List.of(selected.id()))).thenReturn(List.of(selected));
        when(overviews.readCurrentSource(USER_ID, selected.id(), selected.ingestionRevision()))
                .thenReturn(Optional.empty());
        ChatReadTools.ReadScope scope = tools.begin(USER_ID,
                new ReadingContext(null, SUBJECT_ID, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(selected.id())));

        JsonNode result = objectMapper.readTree(tools.execute(scope, null, ChatReadTools.READ_SOURCE_OVERVIEW,
                "{\"sourceId\":\"" + selected.id() + "\"}"));

        assertThat(result.path("status").textValue()).isEqualTo("UNAVAILABLE");
        assertThat(result.path("hasMore").booleanValue()).isFalse();
        assertThat(result.path("guidance").textValue()).contains("Continue with source search or excerpts");
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.READ_SOURCE_OVERVIEW,
                "{\"sourceId\":\"" + outside.id() + "\"}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
        verify(overviews, times(1)).readCurrentSource(USER_ID, selected.id(), selected.ingestionRevision());
        verify(overviews, never()).readCurrentSource(eq(USER_ID), eq(outside.id()), any());
    }

    @Test
    void searchUsesFrozenCatalogScopeAndCanNarrowItToOneSource() throws Exception {
        UUID selectedId = UUID.fromString("00000000-0000-0000-0000-000000000041");
        UUID otherId = UUID.fromString("00000000-0000-0000-0000-000000000042");
        SourceView selected = source(selectedId.toString(), SUBJECT_ID, "Selected", SourceIngestionStatus.READY,
                "00000000-0000-0000-0000-000000000401");
        SourceView other = source(otherId.toString(), UUID.fromString("00000000-0000-0000-0000-000000000099"),
                "Other", SourceIngestionStatus.READY,
                "00000000-0000-0000-0000-000000000402");
        SourceView newlyReady = source("00000000-0000-0000-0000-000000000043", SUBJECT_ID, "Newly ready",
                SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000403");
        when(sources.list(USER_ID)).thenReturn(List.of(selected, other), List.of(selected, other, newlyReady));
        when(sources.findActiveViewsByIds(eq(USER_ID), anyCollection())).thenAnswer(invocation -> {
            java.util.Collection<UUID> ids = invocation.getArgument(1);
            return List.of(selected, other, newlyReady).stream().filter(source -> ids.contains(source.id())).toList();
        });
        List<Double> vector = new ArrayList<>(java.util.Collections.nCopies(1024, 0d));
        vector.set(0, 1d);
        SourceChunkRepository chunkRepository = mock(SourceChunkRepository.class);
        UUID selectedChunkId = UUID.fromString("00000000-0000-0000-0000-000000000411");
        String vectorJson = objectMapper.writeValueAsString(vector);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(USER_ID, selectedId))
                .thenReturn(List.of(new SourceChunkEntity(selectedChunkId, USER_ID, selectedId, 0,
                        "selected evidence", "hash1", 0, 17, vectorJson)));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(USER_ID, otherId))
                .thenReturn(List.of(new SourceChunkEntity(UUID.randomUUID(), USER_ID, otherId, 0,
                        "other evidence", "hash2", 0, 14, vectorJson)));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(USER_ID, newlyReady.id()))
                .thenReturn(List.of(new SourceChunkEntity(UUID.randomUUID(), USER_ID, newlyReady.id(), 0,
                        "newly available evidence", "hash3", 0, 24, vectorJson)));
        RetrievalService retrieval = new RetrievalService(chunkRepository, sources,
                mock(PgVectorRetrievalRepository.class), subjects);
        AiSettingsService settings = mock(AiSettingsService.class);
        when(settings.resolveServerManagedEmbedding()).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.OPENAI_COMPATIBLE, "embedding-model",
                new AiCredential("https://example.invalid", "key", "embedding-model"),
                AiCredentialSource.PLATFORM));
        AiTaskScope taskScope = mock(AiTaskScope.class);
        when(taskScope.embed(eq(AiStage.RETRIEVAL_EMBEDDING), eq(AiProviderType.OPENAI_COMPATIBLE), anyString(),
                anyList(), any(), eq(AiCredentialSource.PLATFORM)))
                .thenReturn(new AiInvocationResult<>(new EmbeddingResult(List.of(vector)), null));
        ChatReadTools searchTools = new ChatReadTools(null, objectMapper, retrieval, sources, chunkRepository,
                subjects, settings, ChatAgentProperties.defaults(), overviews);
        ChatReadTools.ReadScope scope = searchTools.begin(USER_ID, null);
        JsonNode catalog = objectMapper.readTree(searchTools.execute(scope, null, ChatReadTools.LIST_SOURCES, "{}"));
        UUID catalogSourceId = UUID.fromString(catalog.path("items").get(0).path("sourceId").textValue());

        JsonNode result = objectMapper.readTree(searchTools.execute(scope, taskScope, ChatReadTools.SEARCH,
                "{\"query\":\"query\",\"sourceIds\":[\"" + catalogSourceId + "\"]}"));

        assertThat(catalogSourceId).isEqualTo(selectedId);
        assertThat(result.path("evidence")).hasSize(1);
        assertThat(result.path("evidence").get(0).path("sourceId").textValue()).isEqualTo(selectedId.toString());
        assertThat(result.path("evidence").get(0).path("chunkId").textValue()).isEqualTo(selectedChunkId.toString());
        verify(chunkRepository, never()).findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(USER_ID, otherId);
        verify(taskScope, times(1)).embed(eq(AiStage.RETRIEVAL_EMBEDDING), eq(AiProviderType.OPENAI_COMPATIBLE),
                anyString(), eq(List.of("query")), any(), eq(AiCredentialSource.PLATFORM));

        JsonNode allEvidence = objectMapper.readTree(searchTools.execute(scope, taskScope, ChatReadTools.SEARCH,
                "{\"query\":\"all evidence\"}")).path("evidence");

        assertThat(allEvidence).extracting(item -> item.path("sourceId").textValue())
                .containsExactlyInAnyOrder(selectedId.toString(), otherId.toString());
        verify(sources, times(1)).list(USER_ID);
        verify(chunkRepository, never())
                .findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(USER_ID, newlyReady.id());
        verify(taskScope, times(1)).embed(eq(AiStage.RETRIEVAL_EMBEDDING), eq(AiProviderType.OPENAI_COMPATIBLE),
                anyString(), eq(List.of("all evidence")), any(), eq(AiCredentialSource.PLATFORM));
    }

    @Test
    void searchRejectsMalformedAndUnknownSourceSelectorsWithoutFallingBackToWholeScope() {
        SourceView source = source("00000000-0000-0000-0000-000000000051", SUBJECT_ID,
                "Source", SourceIngestionStatus.READY, "00000000-0000-0000-0000-000000000501");
        when(sources.list(USER_ID)).thenReturn(List.of(source));
        when(sources.findActiveViewsByIds(USER_ID, List.of(source.id()))).thenReturn(List.of(source));
        ChatReadTools.ReadScope scope = tools.begin(USER_ID,
                new ReadingContext(null, SUBJECT_ID, ReadingContext.RetrievalMode.SUBJECT, List.of()));
        List<String> invalidArguments = List.of(
                "{\"query\":\"query\",\"sourceIds\":[]}",
                "{\"query\":\"query\",\"sourceIds\":null}",
                "{\"query\":\"query\",\"sourceIds\":[null]}",
                "{\"query\":\"query\",\"sourceIds\":[\"not-a-uuid\"]}",
                "{\"query\":\"query\",\"sourceIds\":[\"" + source.id() + "\",\"" + source.id() + "\"]}",
                "{\"query\":\"query\",\"sourceId\":\"" + source.id() + "\"}");

        invalidArguments.forEach(arguments -> assertThatThrownBy(() ->
                tools.execute(scope, null, ChatReadTools.SEARCH, arguments))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID"));
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.SEARCH,
                "{\"query\":\"query\",\"sourceIds\":[\"00000000-0000-0000-0000-000000000099\"]}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.READ_SOURCE_OVERVIEW,
                "{\"sourceId\":\"00000000-0000-0000-0000-000000000099\"}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.READ_EXCERPT,
                "{\"sourceId\":\"00000000-0000-0000-0000-000000000099\","
                        + "\"chunkId\":\"00000000-0000-0000-0000-000000000098\"}"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
        assertThatThrownBy(() -> scope.validateSources(List.of(UUID.fromString(
                "00000000-0000-0000-0000-000000000099"))))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("SOURCE_SCOPE_DENIED");
        assertThatThrownBy(() -> tools.execute(scope, null, ChatReadTools.SEARCH, "{"))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("CHAT_TOOL_ARGUMENT_INVALID");
    }

    private SourceView source(String id, UUID subjectId, String title,
            SourceIngestionStatus status, String revision) {
        return new SourceView(UUID.fromString(id), subjectId, SourceType.TEXT, title, null, null,
                "raw text is not included in the catalog", "outline is not included in the catalog", status,
                UUID.fromString(revision), null, null, 0, Instant.EPOCH, Instant.EPOCH, null, null);
    }

    private OverviewResultView savedOverview(SourceView source) {
        return new OverviewResultView(UUID.randomUUID(), "SOURCE", source.id(), source.subjectId(),
                source.ingestionRevision(), 7, 4, 5, 2, "Saved",
                "## Outline\n\n### 第一章\n\n**小节**: 细节",
                "## Summary\n\n概述\uD83C\uDF3F\n\n### Key points\n\n- 要点\n\n### Learning path\n\n- 第一步",
                List.of(), List.of(), null, null, null, null, Instant.EPOCH, null, null);
    }
}

