package com.auralis.app.ai.internal.chat;

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
import java.util.function.Predicate;

/** Builds a deterministic, budget-fitted model view without changing saved/public conversation history. */
@Component
public final class ChatEvidenceHistoryProjector {
    private static final String ERROR_RESULT = "{\"status\":\"tool_error\"}";
    private final ObjectMapper mapper;

    public ChatEvidenceHistoryProjector(ObjectMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper);
    }

    /**
     * `requiredContext` contains system, active scope, current user and necessary activity context.
     * `currentIterationMessages` contains the current model iteration and its full tool exchanges.
     * Prior turns must be supplied oldest first. `fits` must inspect the fully mapped provider request,
     * including tool definitions, using the same serialized-byte limit as the Gateway.
     */
    public Projection project(List<ChatMessage> requiredContext, List<HistoryTurn> priorTurns,
                              List<ChatMessage> currentIterationMessages,
                              Predicate<List<ChatMessage>> fits) {
        List<ChatMessage> required = List.copyOf(requiredContext);
        List<HistoryTurn> turns = List.copyOf(priorTurns);
        List<ChatMessage> current = List.copyOf(currentIterationMessages);
        Objects.requireNonNull(fits);

        ArrayList<ChatMessage> candidate = compose(required, turns, current, -1);
        if (fits.test(List.copyOf(candidate))) return new Projection(candidate, true);

        // Keep the newest previous turn complete. Older turns first retain bounded real excerpts
        // and source/version metadata, then are removed oldest-first if still over capacity.
        for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
            candidate = compose(required, turns, current, excerptLimit);
            if (fits.test(List.copyOf(candidate))) return new Projection(candidate, true);
        }
        while (turns.size() > 1) {
            turns = List.copyOf(turns.subList(1, turns.size()));
            for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
                candidate = compose(required, turns, current, excerptLimit);
                if (fits.test(List.copyOf(candidate))) return new Projection(candidate, true);
            }
        }
        if (!turns.isEmpty()) {
            // Only reduce the newest prior turn after every older turn has been removed.
            for (int excerptLimit : new int[]{256, 128, 64, 32, 0}) {
                candidate = compose(required, turns, current, excerptLimit, true);
                if (fits.test(List.copyOf(candidate))) return new Projection(candidate, true);
            }
        }
        candidate = compose(required, List.of(), current, 0);
        return new Projection(candidate, fits.test(List.copyOf(candidate)));
    }

    private ArrayList<ChatMessage> compose(List<ChatMessage> required, List<HistoryTurn> turns,
            List<ChatMessage> current, int olderExcerptLimit) {
        return compose(required, turns, current, olderExcerptLimit, false);
    }

    private ArrayList<ChatMessage> compose(List<ChatMessage> required, List<HistoryTurn> turns,
            List<ChatMessage> current, int olderExcerptLimit, boolean foldNewest) {
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
            boolean fold = olderExcerptLimit >= 0 && (i < turns.size() - 1 || foldNewest);
            result.addAll(toToolMessages(turn.evidence(), fold ? olderExcerptLimit : -1));
            result.addAll(publicMessages.subList(finalReplyIndex, publicMessages.size()));
        }
        result.addAll(current);
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
                        : ERROR_RESULT;
                messages.add(ToolExecutionResultMessage.from(call.toolCallId(), call.toolName(), output));
            }
        }
        return messages;
    }

    private String completeResult(ChatToolEvidence call) {
        ObjectNode wrapper = mapper.createObjectNode();
        wrapper.set("sourceRevisions", mapper.valueToTree(call.sourceRevisions()));
        try {
            wrapper.set("result", mapper.readTree(call.resultJson()));
        } catch (JacksonException exception) {
            wrapper.put("result", call.resultJson());
        }
        return write(wrapper);
    }

    private String foldedResult(ChatToolEvidence call, int excerptByteLimit) {
        try {
            JsonNode source = mapper.readTree(call.resultJson());
            JsonNode projected = metadataAndExcerpts(source, excerptByteLimit);
            ObjectNode wrapper = mapper.createObjectNode();
            wrapper.put("folded", true);
            wrapper.set("sourceRevisions", mapper.valueToTree(call.sourceRevisions()));
            wrapper.set("evidence", projected);
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
            if (List.of("sourceId", "chunkId", "ordinal", "title", "query", "revision", "range").contains(key)) {
                projected.set(key, value);
            } else if (key.equals("excerpt") && value.isTextual() && excerptByteLimit > 0) {
                projected.put(key, utf8Prefix(value.textValue(), excerptByteLimit));
            } else if ((key.equals("evidence") || key.equals("items")) && (value.isArray() || value.isObject())) {
                projected.set(key, metadataAndExcerpts(value, excerptByteLimit));
            }
        });
        return projected;
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

    public record Projection(List<ChatMessage> messages, boolean fits) {
        public Projection { messages = List.copyOf(messages); }
    }
}
