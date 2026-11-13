package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/** Deterministic estimate for Overview text completion requests, independent of the model. */
public final class AiInputTokenEstimator {
    private static final String PROFILE_ID = "unicode-category-v1";
    private static final String LINE_BREAKS = "\\r\\n\\x0B\\x0C\\x1C-\\x1E\\x85\\u2028\\u2029";
    private static final Pattern LINE = Pattern.compile(
            "[^" + LINE_BREAKS + "]*(?:\\r\\n|[" + LINE_BREAKS + "]|$)");
    private static final Pattern OPAQUE = Pattern.compile("[A-Za-z0-9+_/-]{24,}={0,2}");
    private static final String STRUCTURAL = "{}[]():,\"';=<>\\|&*#_`";

    private AiInputTokenEstimator() {
    }

    public static Estimate estimateOverview(AiProviderRequest request) {
        if (!request.tools().isEmpty()) throw new AiPolicyContractException();
        long margin = 64L + 8L * request.messages().size() + (request.structuredJson() ? 32 : 0);
        long tokens = margin;
        long legacyBytesEstimate = 4L * request.messages().size();
        int categoryMessages = 0;
        int byteMessages = 0;
        for (AiProviderRequest.Message message : request.messages()) {
            if (message.role() != AiMessageRole.SYSTEM && message.role() != AiMessageRole.USER) {
                throw new AiPolicyContractException();
            }
            TextEstimate text = estimateText(message.content());
            tokens += Math.ceilDiv(text.weightedHundredths(), 100) + text.fallbackBytes();
            legacyBytesEstimate += utf8Bytes(message.content());
            if (text.weightedHundredths() > 0) categoryMessages++;
            if (text.fallbackBytes() > 0) byteMessages++;
        }
        String strategy = byteMessages == 0 ? "category-only"
                : categoryMessages == 0 ? "byte-only" : "mixed-category-and-bytes";
        return new Estimate(tokens, PROFILE_ID, strategy, legacyBytesEstimate,
                categoryMessages, byteMessages, margin);
    }

    private static TextEstimate estimateText(String content) {
        var lines = LINE.matcher(content);
        long weighted = 0;
        long fallbackBytes = 0;
        boolean fenced = false;
        while (lines.find() && lines.start() < lines.end()) {
            String line = lines.group();
            int start = 0;
            int end = line.length();
            while (start < end && space(line.charAt(start))) start++;
            while (end > start && space(line.charAt(end - 1))) end--;
            boolean fenceMarker = line.startsWith("```", start) || line.startsWith("~~~", start);
            if (fenceMarker || fenced || structurallyDense(line, start, end)) {
                fallbackBytes += utf8Bytes(line);
                if (fenceMarker) fenced = !fenced;
                continue;
            }

            var opaque = OPAQUE.matcher(line);
            boolean nextOpaque = opaque.find();
            for (int offset = 0; offset < line.length();) {
                if (nextOpaque && offset == opaque.start()) {
                    fallbackBytes += opaque.end() - offset;
                    offset = opaque.end();
                    nextOpaque = opaque.find();
                    continue;
                }
                int codePoint = line.codePointAt(offset);
                int weight = weight(codePoint);
                if (weight == 0) {
                    fallbackBytes += utf8Length(codePoint);
                } else {
                    weighted += weight;
                }
                offset += Character.charCount(codePoint);
            }
        }
        return new TextEstimate(weighted, fallbackBytes);
    }

    private static boolean structurallyDense(String line, int start, int end) {
        int count = 0;
        for (int offset = start; offset < end; offset++) {
            if (STRUCTURAL.indexOf(line.charAt(offset)) >= 0) count++;
        }
        return count >= 4 && 8L * count >= line.codePointCount(start, end);
    }

    private static int weight(int codePoint) {
        if (codePoint >= 0x10000 || codePoint == 0x200D || codePoint == 0xFE0F) return 0;
        if (space(codePoint)) return 40;
        int type = Character.getType(codePoint);
        if (type == Character.DECIMAL_DIGIT_NUMBER) return 70;
        if (Character.isLetter(codePoint)) {
            return switch (Character.UnicodeScript.of(codePoint)) {
                case HAN, HIRAGANA, KATAKANA, HANGUL -> 125;
                case LATIN -> 60;
                default -> 0;
            };
        }
        return type >= Character.DASH_PUNCTUATION && type <= Character.FINAL_QUOTE_PUNCTUATION ? 95 : 0;
    }

    private static boolean space(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == 0x85;
    }

    private static int utf8Bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8).length;
    }

    private static int utf8Length(int codePoint) {
        if (codePoint <= 0x7F) return 1;
        if (codePoint <= 0x7FF) return 2;
        return codePoint <= 0xFFFF ? 3 : 4;
    }

    private record TextEstimate(long weightedHundredths, long fallbackBytes) { }

    public record Estimate(long inputTokens, String profileIdentity, String strategy, long legacyBytesEstimate,
                           int categoryMessages, int byteMessages, long safetyMarginTokens) { }
}
