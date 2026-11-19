package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.OverviewResultService;
import com.auralis.app.ai.OverviewResultView;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.ai.AiSettingsService;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Application-owned allowlist for read-only, owner-scoped evidence tools. */
@Component
public final class ChatReadTools {
    public static final String SEARCH = "search";
    public static final String READ_EXCERPT = "read_source_excerpt";
    public static final String READ_SOURCE_OVERVIEW = "read_source_overview";
    public static final String LIST_SOURCES = "list_sources";
    private static final int MAX_SOURCE_PAGE_SIZE = 20;
    private static final int MAX_SOURCE_TITLE_CODE_POINTS = 240;
    private static final int MAX_OVERVIEW_PAGE_CODE_POINTS = 8192;
    private final AiChatRequestMapper mapper;
    private final ObjectMapper objectMapper;
    private final RetrievalService retrieval;
    private final SourceService sources;
    private final SourceChunkRepository chunks;
    private final SubjectService subjects;
    private final AiSettingsService settings;
    private final ChatAgentProperties properties;
    private final OverviewResultService overviews;

    public ChatReadTools(AiChatRequestMapper mapper, ObjectMapper objectMapper, RetrievalService retrieval,
            SourceService sources, SourceChunkRepository chunks, SubjectService subjects,
            AiSettingsService settings, ChatAgentProperties properties, OverviewResultService overviews) {
        this.mapper = mapper; this.objectMapper = objectMapper; this.retrieval = retrieval;
        this.sources = sources; this.chunks = chunks; this.subjects = subjects;
        this.settings = settings; this.properties = properties; this.overviews = overviews;
    }

    public List<dev.langchain4j.agent.tool.ToolSpecification> sdkDefinitions() {
        return DisplayToolRegistry.definitions(definitions()).stream().map(mapper::toSdkTool).toList();
    }

    public List<AiProviderToolDefinition> definitions() {
        return List.of(
                new AiProviderToolDefinition(SEARCH, "在本轮已授权范围内搜索证据；可选 sourceIds 只进一步缩窄本次搜索。",
                        "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":1000},\"sourceIds\":{\"type\":\"array\",\"minItems\":1,\"maxItems\":100,\"uniqueItems\":true,\"items\":{\"type\":\"string\",\"format\":\"uuid\"}}},\"required\":[\"query\"],\"additionalProperties\":false}"),
                new AiProviderToolDefinition(LIST_SOURCES,
                        "分页查看本轮已授权范围内的 READY 学习资料目录。用于资料分布或跨文档覆盖问题；目录仅包含资料信息，不代表已阅读资料正文。hasOverview 仅表示当前有可读的已保存AI总览。目录中的 sourceId 可用于 read_source_overview、与真实 chunkId 一起用于 read_source_excerpt，或作为 search.sourceIds 缩窄本轮授权范围内的搜索。",
                        "{\"type\":\"object\",\"properties\":{\"offset\":{\"type\":\"integer\",\"minimum\":0},\"limit\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":20}},\"additionalProperties\":false}"),
                new AiProviderToolDefinition(READ_EXCERPT, "根据证据分块 ID 阅读一段已授权资料摘录。",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\",\"format\":\"uuid\"},\"chunkId\":{\"type\":\"string\",\"format\":\"uuid\"}},\"required\":[\"sourceId\",\"chunkId\"],\"additionalProperties\":false}"),
                new AiProviderToolDefinition(READ_SOURCE_OVERVIEW,
                        "按需分段读取本轮授权范围内一份资料已保存的AI总览（章节大纲和总结）。总览是导航性AI生成内容，不是原文逐字证据；需要细节或引用时请搜索或读取原文摘录。分页最多8192个Unicode字符。offset大于0时必须带上前一页的overviewVersion。",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\",\"format\":\"uuid\"},\"offset\":{\"type\":\"integer\",\"minimum\":0},\"limit\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":8192},\"overviewVersion\":{\"type\":\"integer\",\"minimum\":1}},\"required\":[\"sourceId\"],\"additionalProperties\":false}"));
    }

    public ReadScope begin(UUID userId, ReadingContext requested) {
        if (requested != null) subjects.requireActiveSubject(userId, requested.subjectId());
        if (requested != null && requested.retrievalMode() == ReadingContext.RetrievalMode.SUBJECT
                && (requested.currentSourceId() != null || !requested.sourceIds().isEmpty())) {
            throw new DomainException("VALIDATION_FAILED", "Subject reading scope does not accept source IDs");
        }
        List<SourceView> all = sources.list(userId);
        UUID subjectId = requested == null ? null : requested.subjectId();
        List<UUID> requestedIds = List.of();
        if (requested != null && requested.retrievalMode() == ReadingContext.RetrievalMode.SELECTED_SOURCES) {
            requestedIds = requested.sourceIds();
            if (requestedIds.isEmpty() || new java.util.HashSet<>(requestedIds).size() != requestedIds.size()) {
                throw new DomainException("VALIDATION_FAILED", "Selected source scope must contain unique sources");
            }
        } else if (requested != null && requested.retrievalMode() == ReadingContext.RetrievalMode.AUTO
                && requested.currentSourceId() != null) {
            requestedIds = List.of(requested.currentSourceId());
        }
        final List<UUID> ids = List.copyOf(requestedIds);
        List<SourceView> allowed = all.stream()
                .filter(source -> subjectId == null || subjectId.equals(source.subjectId()))
                .filter(source -> ids.isEmpty() || ids.contains(source.id()))
                .filter(source -> source.ingestionStatus() == SourceIngestionStatus.READY)
                .sorted(Comparator.comparing(SourceView::id)).toList();
        Map<UUID, UUID> revisions = new LinkedHashMap<>();
        allowed.forEach(source -> revisions.put(source.id(), source.ingestionRevision()));
        if (requested != null && requested.retrievalMode() == ReadingContext.RetrievalMode.SELECTED_SOURCES
                && allowed.size() != new java.util.HashSet<>(ids).size()) {
            throw new DomainException("SOURCE_NOT_READY", "One or more selected sources are unavailable");
        }
        if (requested != null && requested.retrievalMode() == ReadingContext.RetrievalMode.AUTO
                && requested.currentSourceId() != null && allowed.isEmpty()) {
            throw new DomainException("SOURCE_NOT_READY", "Current source is unavailable");
        }
        List<CatalogSource> catalog = allowed.stream()
                .map(source -> new CatalogSource(source.id(), source.title(), source.ingestionRevision()))
                .toList();
        return new ReadScope(userId, subjectId, Map.copyOf(revisions), catalog);
    }

    public String execute(ReadScope scope, AiTaskScope taskScope, String name, String argumentsJson) {
        JsonNode args;
        try {
            args = com.auralis.app.ai.AiProviderRequestValidator.requireObject(argumentsJson);
        } catch (IllegalArgumentException invalidArguments) {
            if (!LIST_SOURCES.equals(name) && !SEARCH.equals(name) && !READ_SOURCE_OVERVIEW.equals(name)) {
                throw invalidArguments;
            }
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        String result = switch (name) {
            case SEARCH -> search(scope, taskScope, requiredText(args, "query"), args);
            case LIST_SOURCES -> listSources(scope, args);
            case READ_EXCERPT -> excerpt(scope, requiredUuid(args, "sourceId"), requiredUuid(args, "chunkId"));
            case READ_SOURCE_OVERVIEW -> readSourceOverview(scope, args);
            default -> throw new DomainException("CHAT_TOOL_NOT_ALLOWED", "Tool is not available");
        };
        if (result.getBytes(StandardCharsets.UTF_8).length > properties.maxToolResultUtf8Bytes()) {
            throw new DomainException("CHAT_TOOL_RESULT_TOO_LARGE", "Tool result exceeds the configured limit");
        }
        scope.validateCurrent();
        return result;
    }

    private String search(ReadScope scope, AiTaskScope taskScope, String query, JsonNode args) {
        scope.validateCurrent();
        List<UUID> sourceIds = searchSourceIds(scope, args);
        if (sourceIds.isEmpty()) return "{\"evidence\":[]}";
        AiSettingsService.ResolvedSettings embedding = settings.resolveServerManagedEmbedding();
        EmbeddingResult embedded = taskScope.embed(AiStage.RETRIEVAL_EMBEDDING, embedding.provider(),
                embedding.credential().model(), List.of(query), embedding.credential(), embedding.source()).value();
        if (embedded == null || embedded.vectors().isEmpty()) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "Search did not return an embedding");
        }
        List<Citation> evidence = retrieval.retrieveWithinSources(
                scope.userId, embedded.vectors().getFirst(), 5, sourceIds, scope.subjectId, query);
        scope.validateSources(evidence.stream().map(Citation::sourceId).distinct().toList());
        List<Map<String, Object>> output = evidence.stream().map(citation -> Map.<String, Object>of(
                "sourceId", citation.sourceId().toString(), "chunkId", citation.chunkId().toString(),
                "ordinal", citation.ordinal(), "title", Objects.toString(citation.title(), ""),
                "excerpt", Objects.toString(citation.excerpt(), ""))).toList();
        try { return objectMapper.writeValueAsString(Map.of("evidence", output)); }
        catch (Exception exception) { throw new IllegalStateException("Unable to serialize evidence result", exception); }
    }

    private List<UUID> searchSourceIds(ReadScope scope, JsonNode args) {
        if (args.properties().stream().anyMatch(entry -> !entry.getKey().equals("query")
                && !entry.getKey().equals("sourceIds"))) {
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        JsonNode value = args.get("sourceIds");
        if (value == null) return scope.catalog.stream().map(CatalogSource::id).toList();
        if (!value.isArray() || value.size() == 0 || value.size() > 100) {
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        List<UUID> sourceIds = new java.util.ArrayList<>();
        for (JsonNode sourceId : value) {
            if (!sourceId.isTextual()) {
                throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
            }
            try {
                sourceIds.add(UUID.fromString(sourceId.textValue()));
            } catch (IllegalArgumentException invalidSourceId) {
                throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
            }
        }
        if (new java.util.HashSet<>(sourceIds).size() != sourceIds.size()) {
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        scope.requireSubset(sourceIds);
        return List.copyOf(sourceIds);
    }

    private String excerpt(ReadScope scope, UUID sourceId, UUID chunkId) {
        SourceView source = scope.requireSource(sourceId);
        SourceChunkEntity chunk = chunks.findById(chunkId).filter(row -> row.getUserId().equals(scope.userId)
                && row.getSourceId().equals(sourceId) && row.isActive())
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Evidence was not found"));
        return json(Map.of("sourceId", sourceId.toString(), "chunkId", chunkId.toString(),
                "ordinal", chunk.getOrdinal(), "title", source.title(), "excerpt", chunk.getContent()));
    }

    private String readSourceOverview(ReadScope scope, JsonNode args) {
        UUID sourceId = requiredUuid(args, "sourceId");
        long offset = optionalInteger(args, "offset", 0);
        long requestedLimit = optionalInteger(args, "limit", MAX_OVERVIEW_PAGE_CODE_POINTS);
        long requestedVersion = optionalInteger(args, "overviewVersion", -1);
        if (offset < 0 || offset > Integer.MAX_VALUE || requestedLimit < 1
                || requestedLimit > MAX_OVERVIEW_PAGE_CODE_POINTS || requestedVersion == 0
                || requestedVersion < -1
                || args.properties().stream().anyMatch(entry -> !entry.getKey().equals("sourceId")
                        && !entry.getKey().equals("offset") && !entry.getKey().equals("limit")
                        && !entry.getKey().equals("overviewVersion"))
                || offset > 0 && requestedVersion < 1) {
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        SourceView source = scope.requireSource(sourceId);
        OverviewResultView overview = overviews.readCurrentSource(scope.userId, sourceId, source.ingestionRevision())
                .orElse(null);
        if (overview == null) return json(overviewUnavailable(sourceId, source.ingestionRevision(), "UNAVAILABLE"));
        if (requestedVersion > 0 && requestedVersion != overview.version()) {
            return json(overviewUnavailable(sourceId, source.ingestionRevision(), "STALE"));
        }
        String markdown = "# " + overview.title() + "\n\n" + overview.summaryMarkdown()
                + "\n\n" + overview.outlineMarkdown();
        int total = markdown.codePointCount(0, markdown.length());
        int start = (int) Math.min(offset, total);
        int end = (int) Math.min(total, (long) start + requestedLimit);
        String requestedPage = markdown.substring(markdown.offsetByCodePoints(0, start),
                markdown.offsetByCodePoints(0, end));
        int pageLength = maxFittingPageLength(sourceId, source.ingestionRevision(), overview.version(),
                requestedPage, start, total);
        String page = requestedPage.substring(0, requestedPage.offsetByCodePoints(0, pageLength));
        return json(overviewPage(sourceId, source.ingestionRevision(), overview.version(), page, start, total, pageLength));
    }

    private int maxFittingPageLength(UUID sourceId, UUID revision, long version,
                                    String requestedPage, int nextOffset, int total) {
        int low = 0;
        int high = requestedPage.codePointCount(0, requestedPage.length());
        while (low < high) {
            int middle = low + (high - low + 1) / 2;
            String page = requestedPage.substring(0, requestedPage.offsetByCodePoints(0, middle));
            if (json(overviewPage(sourceId, revision, version, page, nextOffset, total, middle))
                    .getBytes(StandardCharsets.UTF_8).length <= properties.maxToolResultUtf8Bytes()) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        if (low == 0 && json(overviewPage(sourceId, revision, version, "", nextOffset, total, 0))
                .getBytes(StandardCharsets.UTF_8).length > properties.maxToolResultUtf8Bytes()) {
            throw new DomainException("CHAT_TOOL_RESULT_TOO_LARGE", "Tool result exceeds the configured limit");
        }
        if (low == 0 && !requestedPage.isEmpty()) {
            throw new DomainException("CHAT_TOOL_RESULT_TOO_LARGE", "Tool result limit cannot fit one overview character");
        }
        return low;
    }

    private Map<String, Object> overviewPage(UUID sourceId, UUID revision, long version, String page,
                                              int start, int total, int pageLength) {
        int nextOffset = start + pageLength;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "AVAILABLE");
        result.put("sourceId", sourceId.toString());
        result.put("revision", revision.toString());
        result.put("overviewVersion", version);
        result.put("overview", page);
        result.put("offset", start);
        result.put("total", total);
        result.put("hasMore", nextOffset < total);
        result.put("nextOffset", nextOffset < total ? nextOffset : null);
        result.put("guidance", "AI-generated navigation, not verbatim source evidence; search or read excerpts for details.");
        return result;
    }

    private Map<String, Object> overviewUnavailable(UUID sourceId, UUID revision, String status) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", status);
        result.put("sourceId", sourceId.toString());
        result.put("revision", revision.toString());
        result.put("overviewVersion", null);
        result.put("overview", "");
        result.put("offset", 0);
        result.put("total", 0);
        result.put("hasMore", false);
        result.put("nextOffset", null);
        result.put("guidance", status.equals("STALE")
                ? "The saved overview changed. Restart at offset 0 without overviewVersion."
                : "No current saved overview is available. Continue with source search or excerpts.");
        return result;
    }

    private String listSources(ReadScope scope, JsonNode args) {
        long offset = optionalInteger(args, "offset", 0);
        long requestedLimit = optionalInteger(args, "limit", MAX_SOURCE_PAGE_SIZE);
        if (offset < 0 || requestedLimit < 1 || requestedLimit > MAX_SOURCE_PAGE_SIZE
                || args.properties().stream().anyMatch(entry -> !entry.getKey().equals("offset")
                        && !entry.getKey().equals("limit"))) {
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        scope.validateCurrent();
        int start = (int) Math.min(offset, scope.catalog.size());
        int end = (int) Math.min((long) start + requestedLimit, scope.catalog.size());
        Map<UUID, UUID> pageRevisions = scope.catalog.subList(start, end).stream()
                .collect(java.util.stream.Collectors.toMap(CatalogSource::id, CatalogSource::revision));
        java.util.Set<UUID> sourceIdsWithOverviews = overviews.currentSourceOverviewIds(scope.userId, pageRevisions);
        List<Map<String, Object>> items = scope.catalog.subList(start, end).stream()
                .map(source -> Map.<String, Object>of("sourceId", source.id().toString(),
                        "title", truncateTitle(source.title()), "revision", source.revision().toString(),
                        "hasOverview", sourceIdsWithOverviews.contains(source.id())))
                .toList();
        boolean hasMore = end < scope.catalog.size();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("total", scope.catalog.size());
        result.put("hasMore", hasMore);
        result.put("nextOffset", hasMore ? end : null);
        return json(result);
    }

    private long optionalInteger(JsonNode node, String name, long defaultValue) {
        JsonNode value = node.get(name);
        if (value == null) return defaultValue;
        if (!value.isIntegralNumber() || !value.canConvertToLong()) {
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        }
        return value.longValue();
    }

    private String truncateTitle(String title) {
        String value = Objects.toString(title, "");
        int codePoints = value.codePointCount(0, value.length());
        return codePoints <= MAX_SOURCE_TITLE_CODE_POINTS ? value
                : value.substring(0, value.offsetByCodePoints(0, MAX_SOURCE_TITLE_CODE_POINTS));
    }

    private String json(Map<String, ?> value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception exception) { throw new IllegalStateException("Unable to serialize source result", exception); }
    }
    private String requiredText(JsonNode node, String name) {
        JsonNode value = node.get(name);
        if (value == null || !value.isTextual() || value.textValue().isBlank() || value.textValue().length() > 1000)
            throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
        return value.textValue().trim();
    }
    private UUID requiredUuid(JsonNode node, String name) {
        try { return UUID.fromString(requiredText(node, name)); }
        catch (IllegalArgumentException e) { throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid"); }
    }

    public final class ReadScope {
        private final UUID userId;
        private final UUID subjectId;
        private final Map<UUID, UUID> revisions;
        private final List<CatalogSource> catalog;
        private ReadScope(UUID userId, UUID subjectId, Map<UUID, UUID> revisions, List<CatalogSource> catalog) {
            this.userId = userId; this.subjectId = subjectId;
            this.revisions = revisions; this.catalog = catalog;
        }
        public void validateCurrent() { validateSources(revisions.keySet().stream().sorted().toList()); }
        public Map<UUID, UUID> revisionSnapshot() { return revisions; }
        String titleFor(UUID id) {
            if (id == null) return null;
            return catalog.stream()
                    .filter(item -> id.equals(item.id()))
                    .map(CatalogSource::title)
                    .filter(title -> title != null && !title.isBlank())
                    .findFirst()
                    .orElse(null);
        }
        public void validateSources(List<UUID> ids) {
            ids.forEach(id -> {
                if (!revisions.containsKey(id)) {
                    throw new DomainException("SOURCE_SCOPE_DENIED", "Source is outside the authorized reading scope");
                }
            });
            List<UUID> requestedIds = ids.stream().distinct().sorted().toList();
            Map<UUID, SourceView> currentSources = sources.findActiveViewsByIds(userId, requestedIds).stream()
                    .collect(java.util.stream.Collectors.toMap(SourceView::id, source -> source));
            if (currentSources.size() != requestedIds.size()) {
                throw new DomainException("RESOURCE_NOT_FOUND", "Source was not found");
            }
            requestedIds.forEach(id -> validateSource(currentSources.get(id)));
        }
        private void requireSubset(List<UUID> ids) {
            if (ids.stream().anyMatch(id -> !revisions.containsKey(id))) {
                throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
            }
        }
        public SourceView requireSource(UUID id) {
            UUID revision = revisions.get(id);
            if (revision == null) throw new DomainException("CHAT_TOOL_ARGUMENT_INVALID", "Tool arguments are invalid");
            SourceView current = sources.requireActiveSource(userId, id);
            validateSource(current);
            return current;
        }
        private void validateSource(SourceView current) {
            UUID revision = revisions.get(current.id());
            if (!current.subjectId().equals(subjectId == null ? current.subjectId() : subjectId)
                    || current.ingestionStatus() != SourceIngestionStatus.READY
                    || !revision.equals(current.ingestionRevision())) {
                throw new DomainException("SOURCE_SCOPE_CHANGED", "Source changed during this Chat run");
            }
        }
    }

    private record CatalogSource(UUID id, String title, UUID revision) { }
}
