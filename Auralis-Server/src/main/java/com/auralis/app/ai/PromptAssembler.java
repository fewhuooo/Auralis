package com.auralis.app.ai;

import com.auralis.app.ai.retrieval.Citation;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Builds a bounded, deterministic provider prompt without exposing failed history. */
public final class PromptAssembler {

    private PromptAssembler() {
    }

    public static List<AiProviderRequest.Message> assemble(
            String systemPrompt,
            List<MessageView> history,
            UUID currentUserMessageId,
            String selectionText,
            List<Citation> citations,
            String currentUserContent,
            int maxPromptChars) {
        if (maxPromptChars < 1) {
            throw new IllegalArgumentException("maxPromptChars must be positive");
        }
        String normalizedCurrentUser = normalize(currentUserContent);
        int contextLimit = Math.max(0, maxPromptChars - Math.min(normalizedCurrentUser.length(), maxPromptChars));
        List<AiProviderRequest.Message> messages = new ArrayList<>();
        int used = 0;
        used = append(messages, AiMessageRole.SYSTEM, systemPrompt, used, contextLimit);

        List<List<MessageView>> pairs = completedPairs(history, currentUserMessageId);
        // Keep the newest completed pairs and drop the oldest pairs first.
        int firstPair = pairs.size();
        int historyChars = 0;
        while (firstPair > 0) {
            int pairChars = pairLength(pairs.get(firstPair - 1));
            if (used + historyChars + pairChars > contextLimit) break;
            historyChars += pairChars;
            firstPair--;
        }
        for (int index = firstPair; index < pairs.size(); index++) {
            for (MessageView message : pairs.get(index)) {
                used = append(messages, message.role(), message.content(), used, contextLimit);
            }
        }

        if (selectionText != null && !selectionText.isBlank()) {
            used = appendContext(messages, "Selected text:\n" + normalize(selectionText), used, contextLimit);
        }
        String retrieved = citations == null ? "" : citations.stream()
                .map(citation -> "[source=" + citation.sourceId() + ", chunk=" + citation.chunkId() + "] "
                        + normalize(citation.excerpt()))
                .filter(value -> value.length() > 0)
                .reduce((left, right) -> left + "\n" + right)
                .orElse("");
        used = appendContext(messages, retrieved, used, contextLimit);
        append(messages, AiMessageRole.USER, normalizedCurrentUser, used, maxPromptChars);
        return List.copyOf(messages);
    }

    public static List<AiProviderRequest.Message> assemble(
            String systemPrompt,
            List<MessageView> history,
            List<Citation> citations,
            String currentUserContent,
            int maxPromptChars) {
        return assemble(systemPrompt, history, null, null, citations, currentUserContent, maxPromptChars);
    }

    private static List<List<MessageView>> completedPairs(List<MessageView> history, UUID currentUserMessageId) {
        List<List<MessageView>> pairs = new ArrayList<>();
        if (history == null) return pairs;
        List<MessageView> pending = new ArrayList<>(2);
        for (MessageView message : history) {
            if (message == null || message.id() != null && message.id().equals(currentUserMessageId)) continue;
            if (message.status() != AiMessageStatus.COMPLETED || message.content() == null || message.content().isBlank()) {
                pending.clear();
                continue;
            }
            if (message.role() == AiMessageRole.USER) {
                pending.clear();
                pending.add(message);
            } else if (message.role() == AiMessageRole.ASSISTANT && !pending.isEmpty()) {
                pending.add(message);
                pairs.add(List.copyOf(pending));
                pending.clear();
            }
        }
        return pairs;
    }

    private static int pairLength(List<MessageView> pair) {
        return pair.stream().mapToInt(message -> normalize(message.content()).length()).sum();
    }

    private static int appendContext(List<AiProviderRequest.Message> messages, String content, int used, int max) {
        if (content == null || content.isBlank()) return used;
        return append(messages, AiMessageRole.SYSTEM, content, used, max);
    }

    private static int append(
            List<AiProviderRequest.Message> messages,
            AiMessageRole role,
            String content,
            int used,
            int max) {
        String normalized = normalize(content);
        if (normalized.isEmpty() || used >= max) return used;
        int remaining = max - used;
        String bounded = normalized.length() <= remaining ? normalized : normalized.substring(0, remaining);
        messages.add(new AiProviderRequest.Message(role, bounded));
        return used + bounded.length();
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
