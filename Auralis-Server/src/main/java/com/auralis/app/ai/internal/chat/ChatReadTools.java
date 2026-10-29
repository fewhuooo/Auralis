package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.AiProviderType;
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
    public static final String READ_OUTLINE = "read_outline";
    private final AiChatRequestMapper mapper;
    private final ObjectMapper objectMapper;
    private final RetrievalService retrieval;
    private final SourceService sources;
    private final SourceChunkRepository chunks;
    private final SubjectService subjects;
    private final AiSettingsService settings;
    private final ChatAgentProperties properties;

    public ChatReadTools(AiChatRequestMapper mapper, ObjectMapper objectMapper, RetrievalService retrieval,
            SourceService sources, SourceChunkRepository chunks, SubjectService subjects,
            AiSettingsService settings, ChatAgentProperties properties) {
        this.mapper = mapper; this.objectMapper = objectMapper; this.retrieval = retrieval;
        this.sources = sources; this.chunks = chunks; this.subjects = subjects;
        this.settings = settings; this.properties = properties;
    }

    public List<dev.langchain4j.agent.tool.ToolSpecification> sdkDefinitions() {
        return definitions().stream().map(mapper::toSdkTool).toList();
    }

    public List<AiProviderToolDefinition> definitions() {
        return List.of(
                new AiProviderToolDefinition(SEARCH, "Search authorized ready study sources for evidence.",
                        "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":1000}},\"required\":[\"query\"],\"additionalProperties\":false}"),
                new AiProviderToolDefinition(READ_EXCERPT, "Read one authorized source excerpt by its evidence chunk ID.",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\",\"format\":\"uuid\"},\"chunkId\":{\"type\":\"string\",\"format\":\"uuid\"}},\"required\":[\"sourceId\",\"chunkId\"],\"additionalProperties\":false}"),
                new AiProviderToolDefinition(READ_OUTLINE, "Read the outline of one authorized ready study source.",
                        "{\"type\":\"object\",\"properties\":{\"sourceId\":{\"type\":\"string\",\"format\":\"uuid\"}},\"required\":[\"sourceId\"],\"additionalProperties\":false}"));
    }

    public ReadScope begin(UUID userId, ReadingContext requested) {
        if (requested != null) subjects.requireActiveSubject(userId, requested.subjectId());
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
        return new ReadScope(userId, subjectId, requested, Map.copyOf(revisions));
    }

    public String execute(ReadScope scope, AiTaskScope taskScope, String name, String argumentsJson) {
        JsonNode args = com.auralis.app.ai.AiProviderRequestValidator.requireObject(argumentsJson);
        String result = switch (name) {
            case SEARCH -> search(scope, taskScope, requiredText(args, "query"));
            case READ_EXCERPT -> excerpt(scope, requiredUuid(args, "sourceId"), requiredUuid(args, "chunkId"));
            case READ_OUTLINE -> outline(scope, requiredUuid(args, "sourceId"));
            default -> throw new DomainException("CHAT_TOOL_NOT_ALLOWED", "Tool is not available");
        };
        if (result.getBytes(StandardCharsets.UTF_8).length > properties.maxToolResultUtf8Bytes()) {
            throw new DomainException("CHAT_TOOL_RESULT_TOO_LARGE", "Tool result exceeds the configured limit");
        }
        scope.validateCurrent();
        return result;
    }

    private String search(ReadScope scope, AiTaskScope taskScope, String query) {
        scope.validateCurrent();
        AiSettingsService.ResolvedSettings embedding = settings.resolveServerManagedEmbedding();
        EmbeddingResult embedded = taskScope.embed(AiStage.RETRIEVAL_EMBEDDING, AiProviderType.SILICONFLOW,
                embedding.credential().model(), List.of(query), embedding.credential(), embedding.source()).value();
        if (embedded == null || embedded.vectors().isEmpty()) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "Search did not return an embedding");
        }
        ReadingContext context = scope.readingContext;
        List<Citation> evidence = context == null
                ? retrieval.retrieve(scope.userId, embedded.vectors().getFirst(), 5)
                : retrieval.retrieve(scope.userId, embedded.vectors().getFirst(), 5, context, query);
        scope.validateSources(evidence.stream().map(Citation::sourceId).distinct().toList());
        List<Map<String, Object>> output = evidence.stream().map(citation -> Map.<String, Object>of(
                "sourceId", citation.sourceId().toString(), "chunkId", citation.chunkId().toString(),
                "ordinal", citation.ordinal(), "title", Objects.toString(citation.title(), ""),
                "excerpt", Objects.toString(citation.excerpt(), ""))).toList();
        try { return objectMapper.writeValueAsString(Map.of("evidence", output)); }
        catch (Exception exception) { throw new IllegalStateException("Unable to serialize evidence result", exception); }
    }

    private String excerpt(ReadScope scope, UUID sourceId, UUID chunkId) {
        SourceView source = scope.requireSource(sourceId);
        SourceChunkEntity chunk = chunks.findById(chunkId).filter(row -> row.getUserId().equals(scope.userId)
                && row.getSourceId().equals(sourceId) && row.isActive())
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Evidence was not found"));
        return json(Map.of("sourceId", sourceId.toString(), "chunkId", chunkId.toString(),
                "ordinal", chunk.getOrdinal(), "title", source.title(), "excerpt", chunk.getContent()));
    }

    private String outline(ReadScope scope, UUID sourceId) {
        SourceView source = scope.requireSource(sourceId);
        if (source.outline() == null || source.outline().isBlank()) return json(Map.of("sourceId", sourceId.toString(), "outline", ""));
        return json(Map.of("sourceId", sourceId.toString(), "outline", source.outline()));
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
        private final ReadingContext readingContext;
        private final Map<UUID, UUID> revisions;
        private ReadScope(UUID userId, UUID subjectId, ReadingContext context, Map<UUID, UUID> revisions) {
            this.userId = userId; this.subjectId = subjectId; this.readingContext = context; this.revisions = revisions;
        }
        public void validateCurrent() { validateSources(revisions.keySet().stream().toList()); }
        public Map<UUID, UUID> revisionSnapshot() { return revisions; }
        public void validateSources(List<UUID> ids) { ids.forEach(this::requireSource); }
        public SourceView requireSource(UUID id) {
            UUID revision = revisions.get(id);
            if (revision == null) throw new DomainException("SOURCE_SCOPE_DENIED", "Source is outside the authorized reading scope");
            SourceView current = sources.requireActiveSource(userId, id);
            if (!current.subjectId().equals(subjectId == null ? current.subjectId() : subjectId)
                    || current.ingestionStatus() != SourceIngestionStatus.READY
                    || !revision.equals(current.ingestionRevision())) {
                throw new DomainException("SOURCE_SCOPE_CHANGED", "Source changed during this Chat run");
            }
            return current;
        }
    }
}
