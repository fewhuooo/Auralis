package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiChatRequestCapacity;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiFunction;

/** Builds a deterministic, budget-fitted model view without changing saved/public conversation history. */
@Component
public final class ChatEvidenceHistoryProjector {
    private static final String ERROR_RESULT = "{\"status\":\"tool_error\"}";
    static final String READ_TOOL_ERROR_HISTORY_HINT = "This tool call failed in a prior attempt. Its safe error code describes that attempt and does not limit the current attempt.";
    static final String PREVIOUS_READ_TOOL_ERROR_HINT = "This call was skipped in the same earlier batch because a prior read tool failed. This fact alone does not limit the current attempt.";
    private static final java.util.Set<String> SAFE_ARGUMENT_FIELDS = java.util.Set.of("title", "description",
            "items", "chartType", "unit", "question", "questionType", "options", "reference", "answer",
            "explanation", "points", "placeholder", "current", "key", "text", "label", "value",
            "entries", "tag");
    private final ObjectMapper mapper;

    public ChatEvidenceHistoryProjector(ObjectMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper);
    }

    /**
     * `requiredContext` and `protectedCurrentContext` are never reduced. Current tool exchanges are
     * projected separately from that protected context. Prior turns must be supplied oldest first.
     * `evaluate` inspects the fully mapped provider request, including tools and all capacity dimensions.
     */
    public Projection project(List<ChatMessage> requiredContext, List<HistoryTurn> priorTurns,
                              List<ChatMessage> protectedCurrentContext, List<ChatMessage> currentExchanges,
                              List<ChatToolEvidence> currentEvidence,
                              BiFunction<List<ChatMessage>, Map<String, String>, AiChatRequestCapacity.Check> evaluate) {
        List<ChatMessage> required = List.copyOf(requiredContext);
        List<HistoryTurn> turns = List.copyOf(priorTurns);
        List<ChatMessage> currentContext = List.copyOf(protectedCurrentContext);
        List<ChatMessage> exchanges = List.copyOf(currentExchanges);
        List<ChatToolEvidence> evidence = List.copyOf(currentEvidence);
        Objects.requireNonNull(evaluate);

        ArrayList<ChatMessage> candidate = compose(required, turns, currentContext, exchanges, evidence, -1, -1);
        Projection result = projection(candidate, turns, evaluate);
        if (result.fits()) return result;

        // Keep the newest previous turn complete. Older turns first retain bounded real excerpts
        // and source/version metadata, then are removed oldest-first if still over capacity.
        for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
            candidate = compose(required, turns, currentContext, exchanges, evidence, excerptLimit, -1);
            result = projection(candidate, turns, evaluate);
            if (result.fits()) return result;
        }
        while (turns.size() > 1) {
            turns = List.copyOf(turns.subList(1, turns.size()));
            for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
                candidate = compose(required, turns, currentContext, exchanges, evidence, excerptLimit, -1);
                result = projection(candidate, turns, evaluate);
                if (result.fits()) return result;
            }
        }
        if (!turns.isEmpty()) {
            // Only reduce the newest prior turn after every older turn has been removed.
            for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
                candidate = compose(required, turns, currentContext, exchanges, evidence, excerptLimit, -1, true);
                result = projection(candidate, turns, evaluate);
                if (result.fits()) return result;
            }
        }
        candidate = compose(required, List.of(), currentContext, exchanges, evidence, 0, -1);
        result = projection(candidate, List.of(), evaluate);
        if (result.fits()) return result;
        for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
            candidate = compose(required, List.of(), currentContext, exchanges, evidence, 0, excerptLimit);
            result = projection(candidate, List.of(), evaluate);
            if (result.fits()) return result;
        }
        for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
            candidate = compose(required, List.of(), currentContext, exchanges, evidence, 0, excerptLimit, false, true);
            result = projection(candidate, List.of(), evaluate);
            if (result.fits()) return result;
        }
        candidate = compose(required, List.of(), currentContext, exchanges, evidence, 0, 0, false, true);
        result = projection(candidate, List.of(), evaluate);
        if (result.fits()) return result;
        return new Projection(result.messages(), result.capacityCheck(), result.reasoningByToolCallId(),
                statistics(candidate, required.size(), currentContext.size(), exchanges.size()));
    }

    private ArrayList<ChatMessage> compose(List<ChatMessage> required, List<HistoryTurn> turns,
            List<ChatMessage> currentContext, List<ChatMessage> currentExchanges,
            List<ChatToolEvidence> currentEvidence, int olderExcerptLimit, int currentExcerptLimit) {
        return compose(required, turns, currentContext, currentExchanges, currentEvidence,
                olderExcerptLimit, currentExcerptLimit, false, false);
    }

    private ArrayList<ChatMessage> compose(List<ChatMessage> required, List<HistoryTurn> turns,
            List<ChatMessage> currentContext, List<ChatMessage> currentExchanges,
            List<ChatToolEvidence> currentEvidence, int olderExcerptLimit, int currentExcerptLimit,
            boolean foldNewest) {
        return compose(required, turns, currentContext, currentExchanges, currentEvidence,
                olderExcerptLimit, currentExcerptLimit, foldNewest, false);
    }

    private ArrayList<ChatMessage> compose(List<ChatMessage> required, List<HistoryTurn> turns,
            List<ChatMessage> currentContext, List<ChatMessage> currentExchanges,
            List<ChatToolEvidence> currentEvidence, int olderExcerptLimit, int currentExcerptLimit,
            boolean foldNewestHistory, boolean foldLatestCurrent) {
        ArrayList<ChatMessage> result = new ArrayList<>(required);
        for (int i = 0; i < turns.size(); i++) {
            HistoryTurn turn = turns.get(i);
            List<ChatMessage> publicMessages = turn.publicMessages();
            int finalReplyIndex = publicMessages.size();
            for (int messageIndex = publicMessages.size() - 1; messageIndex >= 0; messageIndex--) {
                if (publicMessages.get(messageIndex).type() == dev.langchain4j.data.message.ChatMessageType.AI) {
                    finalReplyIndex = messageIndex;
                    break;
                }
                if (publicMessages.get(messageIndex).type() == dev.langchain4j.data.message.ChatMessageType.USER) break;
            }
            result.addAll(publicMessages.subList(0, finalReplyIndex));
            boolean fold = olderExcerptLimit >= 0 && (i < turns.size() - 1 || foldNewestHistory);
            result.addAll(toToolMessages(turn.evidence(), fold ? olderExcerptLimit : -1));
            result.addAll(publicMessages.subList(finalReplyIndex, publicMessages.size()));
        }
        result.addAll(currentContext);
        result.addAll(projectCurrentExchanges(currentExchanges, currentEvidence, currentExcerptLimit,
                foldLatestCurrent));
        return result;
    }

    private List<ChatMessage> toToolMessages(List<ChatToolEvidence> evidence, int excerptByteLimit) {
        Map<String, List<ChatToolEvidence>> iterations = new LinkedHashMap<>();
        evidence.stream().sorted(Comparator.comparingInt(ChatToolEvidence::iterationOrder)
                        .thenComparingInt(ChatToolEvidence::callOrder).thenComparing(ChatToolEvidence::toolCallId))
                .forEach(item -> iterations.computeIfAbsent(item.iterationId(), ignored -> new ArrayList<>()).add(item));
        ArrayList<ChatMessage> messages = new ArrayList<>();
        for (List<ChatToolEvidence> calls : iterations.values()) {
            List<ToolExecutionRequest> requests = calls.stream().map(call -> ToolExecutionRequest.builder()
                    .id(call.toolCallId()).name(call.toolName()).arguments(call.argumentsJson()).build()).toList();
            messages.add(AiMessage.from(requests));
            for (ChatToolEvidence call : calls) {
                String output = call.status().equals("COMPLETED")
                        ? (excerptByteLimit < 0 ? completeResult(call) : foldedResult(call, excerptByteLimit))
                        : safeErrorResult(call.resultJson());
                messages.add(ToolExecutionResultMessage.from(call.toolCallId(), call.toolName(), output));
            }
        }
        return messages;
    }

    private String safeErrorResult(String json) {
        try {
            JsonNode node = mapper.readTree(json);
            if (node == null || !node.isObject()) return ERROR_RESULT;
            if ("tool_error".equals(text(node, "status"))
                    && Boolean.TRUE.equals(booleanValue(node, "repairable"))
                    && "CHAT_TOOL_ARGUMENT_INVALID".equals(text(node, "safeErrorCode"))
                    && node.has("fieldPath")) {
                String path = text(node, "fieldPath");
                if (!safeFieldPath(path)) return ERROR_RESULT;
                LinkedHashMap<String, Object> safe = new LinkedHashMap<>();
                safe.put("status", "tool_error");
                safe.put("safeErrorCode", "CHAT_TOOL_ARGUMENT_INVALID");
                safe.put("fieldPath", path);
                List<String> missing = new ArrayList<>();
                JsonNode rawMissing = node.get("missingFields");
                if (rawMissing != null && rawMissing.isArray()) {
                    rawMissing.forEach(value -> {
                        if (value.isString() && SAFE_ARGUMENT_FIELDS.contains(value.stringValue())) {
                            missing.add(value.stringValue());
                        }
                    });
                }
                if (!missing.isEmpty()) safe.put("missingFields", List.copyOf(missing));
                return write(mapper.valueToTree(safe));
            }
            if ("tool_error".equals(text(node, "status"))
                    && Set.of("CHAT_TOOL_ARGUMENT_INVALID", "RESOURCE_NOT_FOUND").contains(text(node, "safeErrorCode"))) {
                return write(mapper.valueToTree(Map.of("status", "tool_error",
                        "safeErrorCode", text(node, "safeErrorCode"),
                        "hint", READ_TOOL_ERROR_HISTORY_HINT)));
            }
            if ("not_executed".equals(text(node, "status"))
                    && "CHAT_TOOL_NOT_EXECUTED".equals(text(node, "safeErrorCode"))
                    && "PREVIOUS_DISPLAY_ARGUMENT_INVALID".equals(text(node, "reason"))) {
                return "{\"status\":\"not_executed\",\"safeErrorCode\":\"CHAT_TOOL_NOT_EXECUTED\","
                        + "\"reason\":\"PREVIOUS_DISPLAY_ARGUMENT_INVALID\",\"hint\":"
                        + write(mapper.valueToTree(DisplayToolRegistry.NOT_EXECUTED_RETRY_HINT)) + "}";
            }
            if ("not_executed".equals(text(node, "status"))
                    && "CHAT_TOOL_NOT_EXECUTED".equals(text(node, "safeErrorCode"))
                    && "PREVIOUS_READ_TOOL_ERROR".equals(text(node, "reason"))) {
                return write(mapper.valueToTree(Map.of("status", "not_executed",
                        "safeErrorCode", "CHAT_TOOL_NOT_EXECUTED",
                        "reason", "PREVIOUS_READ_TOOL_ERROR",
                        "hint", PREVIOUS_READ_TOOL_ERROR_HINT)));
            }
            if ("not_executed".equals(text(node, "status"))
                    && "CHAT_TOOL_NOT_EXECUTED".equals(text(node, "safeErrorCode"))
                    && "SOURCE_READING_STOPPED".equals(text(node, "reason"))) {
                return write(mapper.valueToTree(Map.of("status", "not_executed",
                        "safeErrorCode", "CHAT_TOOL_NOT_EXECUTED",
                        "reason", "SOURCE_READING_STOPPED",
                        "hint", READ_TOOL_ERROR_HISTORY_HINT)));
            }
            if ("not_executed".equals(text(node, "status"))
                    && "CHAT_TOOL_NOT_EXECUTED".equals(text(node, "safeErrorCode"))
                    && "TOOL_CALL_LIMIT_REACHED".equals(text(node, "reason"))) {
                return write(mapper.valueToTree(Map.of("status", "not_executed",
                        "safeErrorCode", "CHAT_TOOL_NOT_EXECUTED",
                        "reason", "TOOL_CALL_LIMIT_REACHED",
                        "hint", "The prior attempt exhausted its tool-call limit; this call was not executed.")));
            }
        } catch (RuntimeException ignored) {
            // Historical error evidence is never allowed to inject arbitrary text into a later prompt.
        }
        return ERROR_RESULT;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isString() ? value.stringValue() : null;
    }

    private Boolean booleanValue(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isBoolean() ? value.booleanValue() : null;
    }

    private boolean safeFieldPath(String path) {
        if (path == null || !path.startsWith("$") || path.length() > 160) return false;
        String normalized = path.replace("[]", "");
        if (normalized.equals("$")) return true;
        if (!normalized.startsWith("$.")) return false;
        for (String field : normalized.substring(2).split("\\.")) {
            if (!SAFE_ARGUMENT_FIELDS.contains(field)) return false;
        }
        return true;
    }

    private Projection projection(List<ChatMessage> messages, List<HistoryTurn> turns,
            BiFunction<List<ChatMessage>, Map<String, String>, AiChatRequestCapacity.Check> evaluate) {
        Map<String, String> reasoning = reasoningByToolCallId(turns);
        AiChatRequestCapacity.Check check = evaluate.apply(List.copyOf(messages), reasoning);
        return new Projection(messages, check, reasoning, null);
    }

    private ContextStatistics statistics(List<ChatMessage> messages, int requiredCount,
            int protectedCurrentCount, int currentExchangeCount) {
        int priorStart = requiredCount;
        int currentStart = messages.size() - protectedCurrentCount - currentExchangeCount;
        long required = messageBytes(messages.subList(0, requiredCount));
        long prior = messageBytes(messages.subList(priorStart, currentStart));
        long protectedCurrent = messageBytes(messages.subList(currentStart, currentStart + protectedCurrentCount));
        long currentExchanges = messageBytes(messages.subList(currentStart + protectedCurrentCount, messages.size()));
        long toolResults = 0;
        long toolArguments = 0;
        int toolCalls = 0;
        int toolResultCount = 0;
        for (ChatMessage message : messages) {
            switch (message.type()) {
                case SYSTEM, USER -> { }
                case AI -> {
                    AiMessage assistantMessage = (AiMessage) message;
                    for (ToolExecutionRequest request : assistantMessage.toolExecutionRequests()) {
                        toolArguments += utf8(request.arguments());
                        toolCalls++;
                    }
                }
                case TOOL_EXECUTION_RESULT -> {
                    toolResults += utf8(((ToolExecutionResultMessage) message).text());
                    toolResultCount++;
                }
                default -> { }
            }
        }
        return new ContextStatistics(required, prior, protectedCurrent, currentExchanges,
                toolResults, toolArguments, toolCalls, toolResultCount);
    }

    private long messageBytes(List<ChatMessage> messages) {
        long bytes = 0;
        for (ChatMessage message : messages) {
            switch (message.type()) {
                case SYSTEM -> bytes += utf8(((dev.langchain4j.data.message.SystemMessage) message).text());
                case USER -> bytes += utf8(((dev.langchain4j.data.message.UserMessage) message).singleText());
                case AI -> bytes += utf8(((AiMessage) message).text());
                case TOOL_EXECUTION_RESULT -> bytes += utf8(((ToolExecutionResultMessage) message).text());
                default -> { }
            }
        }
        return bytes;
    }

    private List<ChatMessage> projectCurrentExchanges(List<ChatMessage> exchanges,
            List<ChatToolEvidence> currentEvidence, int excerptLimit, boolean foldLatest) {
        if (currentEvidence.isEmpty()) return exchanges;
        Map<String, List<ChatToolEvidence>> byIteration = new LinkedHashMap<>();
        currentEvidence.stream().sorted(Comparator.comparingInt(ChatToolEvidence::iterationOrder)
                        .thenComparingInt(ChatToolEvidence::callOrder))
                .forEach(call -> byIteration.computeIfAbsent(call.iterationId(), ignored -> new ArrayList<>()).add(call));
        List<List<ChatToolEvidence>> iterations = List.copyOf(byIteration.values());
        Map<Integer, ChatToolEvidence> projectableResults = new LinkedHashMap<>();
        int iterationIndex = 0;
        int latestReadResultIndex = -1;
        for (int messageIndex = 0; messageIndex < exchanges.size(); messageIndex++) {
            if (!(exchanges.get(messageIndex) instanceof AiMessage assistant)
                    || assistant.toolExecutionRequests().isEmpty()) continue;
            if (iterationIndex >= iterations.size()) return exchanges;
            List<ChatToolEvidence> calls = iterations.get(iterationIndex++);
            if (assistant.toolExecutionRequests().size() != calls.size()
                    || messageIndex + calls.size() >= exchanges.size()) return exchanges;
            for (int callIndex = 0; callIndex < calls.size(); callIndex++) {
                ToolExecutionRequest request = assistant.toolExecutionRequests().get(callIndex);
                ChatToolEvidence evidence = calls.get(callIndex);
                int resultIndex = messageIndex + callIndex + 1;
                if (!(exchanges.get(resultIndex) instanceof ToolExecutionResultMessage result)
                        || !Objects.equals(request.id(), evidence.toolCallId())
                        || !Objects.equals(request.name(), evidence.toolName())
                        || !Objects.equals(request.arguments(), evidence.argumentsJson())
                        || !Objects.equals(result.id(), evidence.toolCallId())
                        || !Objects.equals(result.toolName(), evidence.toolName())) return exchanges;
                if ("COMPLETED".equals(evidence.status()) && isReadTool(evidence.toolName())
                        && validJson(result.text())) {
                    projectableResults.put(resultIndex, evidence);
                    latestReadResultIndex = resultIndex;
                }
            }
            messageIndex += calls.size();
        }
        if (iterationIndex != iterations.size()) return exchanges;
        int latestReadResult = latestReadResultIndex;
        ArrayList<ChatMessage> projected = new ArrayList<>(exchanges);
        projectableResults.forEach((index, evidence) -> {
            ToolExecutionResultMessage result = (ToolExecutionResultMessage) projected.get(index);
            projected.set(index, excerptLimit >= 0 && (foldLatest || index != latestReadResult)
                    ? foldedCurrentResult(result, evidence, excerptLimit)
                    : deduplicatedCurrentResult(result, evidence));
        });
        return List.copyOf(projected);
    }

    private ToolExecutionResultMessage deduplicatedCurrentResult(ToolExecutionResultMessage result,
            ChatToolEvidence evidence) {
        try {
            DeduplicatedResult deduplicated = deduplicateEvidence(mapper.readTree(result.text()), evidence);
            if (deduplicated.omittedCount() == 0) return result;
            ObjectNode projected = (ObjectNode) deduplicated.result();
            projected.put("deduplicatedEvidenceRowsOmitted", deduplicated.omittedCount());
            return ToolExecutionResultMessage.from(result.id(), result.toolName(), write(projected));
        } catch (JacksonException exception) {
            return result;
        }
    }

    private ToolExecutionResultMessage foldedCurrentResult(ToolExecutionResultMessage result,
            ChatToolEvidence evidence, int excerptLimit) {
        try {
            JsonNode raw = mapper.readTree(result.text());
            DeduplicatedResult deduplicated = deduplicateEvidence(raw, evidence);
            ObjectNode wrapper = mapper.createObjectNode();
            wrapper.put("folded", true);
            wrapper.set("sourceRevisions", mapper.valueToTree(revisionsForResult(evidence, deduplicated.result())));
            wrapper.set("evidence", metadataAndExcerpts(deduplicated.result(), excerptLimit));
            if (deduplicated.omittedCount() > 0) wrapper.put("deduplicatedEvidenceRowsOmitted", deduplicated.omittedCount());
            return ToolExecutionResultMessage.from(result.id(), result.toolName(), write(wrapper));
        } catch (JacksonException exception) {
            return result;
        }
    }

    private boolean validJson(String content) {
        try { return mapper.readTree(content) != null; }
        catch (Exception exception) { return false; }
    }

    private long utf8(String text) {
        return text == null ? 0 : text.getBytes(StandardCharsets.UTF_8).length;
    }

    private Map<String, String> reasoningByToolCallId(List<HistoryTurn> turns) {
        Map<String, String> reasoningByToolCallId = new LinkedHashMap<>();
        for (HistoryTurn turn : turns) {
            Map<String, List<ChatToolEvidence>> iterations = new LinkedHashMap<>();
            turn.evidence().stream().sorted(Comparator.comparingInt(ChatToolEvidence::iterationOrder)
                            .thenComparingInt(ChatToolEvidence::callOrder).thenComparing(ChatToolEvidence::toolCallId))
                    .forEach(item -> iterations.computeIfAbsent(item.iterationId(), ignored -> new ArrayList<>()).add(item));
            for (List<ChatToolEvidence> calls : iterations.values()) {
                String reasoning = calls.stream().map(ChatToolEvidence::reasoningContent)
                        .filter(Objects::nonNull).findFirst().orElse(null);
                if (reasoning != null) calls.forEach(call -> reasoningByToolCallId.put(call.toolCallId(), reasoning));
            }
        }
        return reasoningByToolCallId;
    }

    private String completeResult(ChatToolEvidence call) {
        ObjectNode wrapper = mapper.createObjectNode();
        wrapper.set("sourceRevisions", mapper.valueToTree(call.sourceRevisions()));
        try {
            DeduplicatedResult deduplicated = deduplicateEvidence(mapper.readTree(call.resultJson()), call);
            wrapper.set("result", deduplicated.result());
            if (deduplicated.omittedCount() > 0) {
                wrapper.put("deduplicatedEvidenceRowsOmitted", deduplicated.omittedCount());
            }
        } catch (JacksonException exception) {
            wrapper.put("result", call.resultJson());
        }
        return write(wrapper);
    }

    private String foldedResult(ChatToolEvidence call, int excerptByteLimit) {
        if (!isReadTool(call.toolName())) return completeResult(call);
        try {
            DeduplicatedResult deduplicated = deduplicateEvidence(mapper.readTree(call.resultJson()), call);
            JsonNode projected = metadataAndExcerpts(deduplicated.result(), excerptByteLimit);
            ObjectNode wrapper = mapper.createObjectNode();
            wrapper.put("folded", true);
            wrapper.set("sourceRevisions", mapper.valueToTree(revisionsForResult(call, deduplicated.result())));
            wrapper.set("evidence", projected);
            if (deduplicated.omittedCount() > 0) {
                wrapper.put("deduplicatedEvidenceRowsOmitted", deduplicated.omittedCount());
            }
            return mapper.writeValueAsString(wrapper);
        } catch (JacksonException exception) {
            // Keep deterministic source/version context if a persisted result is not valid JSON.
            ObjectNode wrapper = mapper.createObjectNode();
            wrapper.put("folded", true);
            wrapper.set("sourceRevisions", mapper.valueToTree(call.sourceRevisions()));
            return write(wrapper);
        }
    }

    private JsonNode metadataAndExcerpts(JsonNode node, int excerptByteLimit) {
        if (node.isArray()) {
            ArrayNode array = mapper.createArrayNode();
            node.forEach(child -> {
                JsonNode projected = metadataAndExcerpts(child, excerptByteLimit);
                if (projected != null) array.add(projected);
            });
            return array;
        }
        if (!node.isObject()) return null;
        ObjectNode projected = mapper.createObjectNode();
        node.properties().forEach(entry -> {
            String key = entry.getKey();
            JsonNode value = entry.getValue();
            if (List.of("sourceId", "chunkId", "ordinal", "title", "query", "revision", "range",
                    "overviewVersion", "offset", "total", "hasMore", "nextOffset", "status", "guidance").contains(key)) {
                projected.set(key, value);
            } else if ((key.equals("excerpt") || key.equals("outline") || key.equals("overview"))
                    && value.isTextual() && excerptByteLimit > 0) {
                projected.put(key, utf8Prefix(value.textValue(), excerptByteLimit));
            } else if ((key.equals("evidence") || key.equals("items") || key.equals("result"))
                    && (value.isArray() || value.isObject())) {
                projected.set(key, metadataAndExcerpts(value, excerptByteLimit));
            }
        });
        return projected;
    }

    private DeduplicatedResult deduplicateEvidence(JsonNode result, ChatToolEvidence call) {
        if (!ChatReadTools.SEARCH.equals(call.toolName()) || result == null || !result.isObject()
                || !result.path("evidence").isArray()) return new DeduplicatedResult(result, 0);
        Set<String> revisions = call.sourceRevisions().stream()
                .map(value -> value.sourceId() + "\u0000" + value.revision())
                .collect(java.util.stream.Collectors.toSet());
        Set<String> seen = new java.util.HashSet<>();
        ArrayNode rows = mapper.createArrayNode();
        int omitted = 0;
        for (JsonNode row : result.path("evidence")) {
            String sourceId = text(row, "sourceId");
            String chunkId = text(row, "chunkId");
            String revision = sourceId == null ? null : revisions.stream()
                    .filter(value -> value.startsWith(sourceId + "\u0000"))
                    .map(value -> value.substring(sourceId.length() + 1)).findFirst().orElse(null);
            String key = sourceId == null || chunkId == null || revision == null ? null
                    : sourceId + "\u0000" + chunkId + "\u0000" + revision + "\u0000" + row.toString();
            if (key != null && !seen.add(key)) omitted++;
            else rows.add(row);
        }
        if (omitted == 0) return new DeduplicatedResult(result, 0);
        ObjectNode projected = ((ObjectNode) result).deepCopy();
        projected.set("evidence", rows);
        return new DeduplicatedResult(projected, omitted);
    }

    private List<ChatToolEvidence.SourceRevision> revisionsForResult(ChatToolEvidence call, JsonNode result) {
        Set<String> sourceIds = new java.util.HashSet<>();
        collectSourceIds(result, sourceIds);
        if (sourceIds.isEmpty()) return call.sourceRevisions();
        return call.sourceRevisions().stream().filter(value -> sourceIds.contains(value.sourceId())).toList();
    }

    private void collectSourceIds(JsonNode node, Set<String> sourceIds) {
        if (node.isArray()) node.forEach(child -> collectSourceIds(child, sourceIds));
        if (node.isObject()) {
            String sourceId = text(node, "sourceId");
            if (sourceId != null) sourceIds.add(sourceId);
            node.properties().forEach(entry -> collectSourceIds(entry.getValue(), sourceIds));
        }
    }

    private boolean isReadTool(String toolName) {
        return Set.of(ChatReadTools.SEARCH, ChatReadTools.READ_EXCERPT, ChatReadTools.READ_SOURCE_OVERVIEW).contains(toolName);
    }

    private String utf8Prefix(String text, int maxBytes) {
        StringBuilder prefix = new StringBuilder();
        int used = 0;
        for (int offset = 0; offset < text.length();) {
            int codePoint = text.codePointAt(offset);
            String next = new String(Character.toChars(codePoint));
            int bytes = next.getBytes(StandardCharsets.UTF_8).length;
            if (used + bytes > maxBytes) break;
            prefix.append(next);
            used += bytes;
            offset += Character.charCount(codePoint);
        }
        return prefix.toString();
    }

    private String write(JsonNode node) {
        try { return mapper.writeValueAsString(node); }
        catch (JacksonException exception) { throw new IllegalStateException("Unable to project Chat evidence", exception); }
    }

    public record HistoryTurn(List<ChatMessage> publicMessages, List<ChatToolEvidence> evidence) {
        public HistoryTurn {
            publicMessages = List.copyOf(publicMessages);
            evidence = List.copyOf(evidence);
        }
    }

    public record Projection(List<ChatMessage> messages, AiChatRequestCapacity.Check capacityCheck,
                             Map<String, String> reasoningByToolCallId, ContextStatistics statistics) {
        public Projection {
            messages = List.copyOf(messages);
            reasoningByToolCallId = reasoningByToolCallId == null ? Map.of() : Map.copyOf(reasoningByToolCallId);
        }
        public boolean fits() { return capacityCheck.fits(); }
    }

    public record ContextStatistics(long requiredContextContentBytes, long priorHistoryContentBytes,
                                    long protectedCurrentContentBytes, long currentExchangeContentBytes,
                                    long toolResultContentBytes, long toolCallArgumentBytes,
                                    int toolCallCount, int toolResultCount) { }

    private record DeduplicatedResult(JsonNode result, int omittedCount) { }
}
