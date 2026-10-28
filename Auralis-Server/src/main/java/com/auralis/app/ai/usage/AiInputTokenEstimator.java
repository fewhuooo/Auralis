package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Resolves a deterministic, fail-closed input estimate for Overview completion requests. */
public final class AiInputTokenEstimator {
    public static final String MODE_LEGACY_BYTES = "legacy-bytes";
    public static final String MODE_CALIBRATED_CATEGORY = "calibrated-category";
    public static final String MODE_MIMO_BYTE_CATEGORY_CANDIDATE = "mimo-byte-category-candidate";
    public static final String LEGACY_PROFILE_ID = "utf8-bytes-v1";
    public static final String CATEGORY_PROFILE_ID = "deepseek-v4-flash-char-category-v1";
    public static final String MIMO_CANDIDATE_PROFILE_ID = "mimo-v2-6-flash-byte-category-candidate-v1";
    public static final long MIMO_CANDIDATE_FIXED_MARGIN_TOKENS = 64;
    public static final long CATEGORY_SAFETY_MULTIPLIER = 2;
    public static final long CATEGORY_FIXED_MARGIN_TOKENS = 64;
    private static final String OFFICIAL_HOST = "api.deepseek.com";
    private static final String OFFICIAL_MODEL = "deepseek-v4-flash";
    private static final String MIMO_OFFICIAL_HOST = "api.xiaomimimo.com";
    private static final String MIMO_OFFICIAL_MODEL = "mimo-v2.6-flash";
    private static final Pattern MIMO_BYTE_ESTIMATED_TOKEN = Pattern.compile(
            "(?i)(?<![A-Za-z0-9])(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9+/_-]{24,}={0,2})(?![A-Za-z0-9])");
    private static final long MESSAGE_FRAMING_TOKENS = 4;
    private static final AiTokenShadowEstimator CATEGORY_ESTIMATOR = new AiTokenShadowEstimator();
    private static final ObjectMapper JSON = new ObjectMapper();

    private AiInputTokenEstimator() {
    }

    public static Profile resolve(AiProviderType provider, String endpointBaseUrl,
                                  String exactRequestedModel, String mode) {
        if (MODE_CALIBRATED_CATEGORY.equals(mode)
                && provider == AiProviderType.DEEPSEEK
                && OFFICIAL_MODEL.equals(exactRequestedModel)
                && isOfficialEndpoint(endpointBaseUrl)) {
            return new Profile(CATEGORY_PROFILE_ID, ProfileKind.DEEPSEEK_CATEGORY);
        }
        if (MODE_MIMO_BYTE_CATEGORY_CANDIDATE.equals(mode)
                && provider == AiProviderType.OPENAI_COMPATIBLE
                && MIMO_OFFICIAL_MODEL.equals(exactRequestedModel)
                && isOfficialMimoEndpoint(endpointBaseUrl)) {
            return new Profile(MIMO_CANDIDATE_PROFILE_ID, ProfileKind.MIMO_BYTE_CATEGORY_CANDIDATE);
        }
        return new Profile(LEGACY_PROFILE_ID, ProfileKind.LEGACY_BYTES);
    }

    public static Profile legacyProfile() {
        return new Profile(LEGACY_PROFILE_ID, ProfileKind.LEGACY_BYTES);
    }

    private static boolean isOfficialEndpoint(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            URI uri = URI.create(value.trim()).normalize();
            String path = uri.getPath();
            return "https".equalsIgnoreCase(uri.getScheme())
                    && OFFICIAL_HOST.equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && (path == null || path.isEmpty() || "/".equals(path))
                    && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean isOfficialMimoEndpoint(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            URI uri = URI.create(value.trim());
            String path = uri.getPath();
            return "https".equalsIgnoreCase(uri.getScheme())
                    && MIMO_OFFICIAL_HOST.equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && ("/v1".equals(path) || "/v1/".equals(path))
                    && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    public static final class Profile {
        private final String identity;
        private final ProfileKind kind;

        private Profile(String identity, ProfileKind kind) {
            this.identity = identity;
            this.kind = kind;
        }

        public String identity() {
            return identity;
        }

        public Estimate estimate(List<AiProviderRequest.Message> messages) {
            Objects.requireNonNull(messages, "messages");
            try {
                long byteBody = 0;
                long categoryBody = 0;
                int categoryMessages = 0;
                int byteMessages = 0;
                for (AiProviderRequest.Message message : messages) {
                    if (message == null || message.content() == null) {
                        throw new IllegalArgumentException("Message content is required");
                    }
                    String content = message.content();
                    long bytes = content.getBytes(StandardCharsets.UTF_8).length;
                    byteBody = addExact(byteBody, bytes);
                    CategoryShape shape = kind == ProfileKind.DEEPSEEK_CATEGORY ? analyzeCategoryShape(content)
                            : kind == ProfileKind.MIMO_BYTE_CATEGORY_CANDIDATE
                            ? analyzeMimoCandidateShape(content) : null;
                    if (shape != null && shape.supported() && kind == ProfileKind.DEEPSEEK_CATEGORY) {
                        long estimate = CATEGORY_ESTIMATOR.estimate(shape.hanRuns(), 0).tokens();
                        long otherBytes = Math.subtractExact(bytes, shape.hanUtf8Bytes());
                        categoryBody = addExact(categoryBody, addExact(otherBytes,
                                Math.multiplyExact(estimate, CATEGORY_SAFETY_MULTIPLIER)));
                        categoryMessages++;
                    } else if (shape != null && shape.supported()
                            && kind == ProfileKind.MIMO_BYTE_CATEGORY_CANDIDATE) {
                        categoryBody = addExact(categoryBody, estimateMimoCandidateBytes(content));
                        categoryMessages++;
                    } else {
                        categoryBody = addExact(categoryBody, bytes);
                        byteMessages++;
                    }
                }

                long framing = Math.multiplyExact(MESSAGE_FRAMING_TOKENS, messages.size());
                long legacy = addExact(byteBody, framing);
                if (kind == ProfileKind.LEGACY_BYTES || categoryMessages == 0) {
                    String strategy = kind == ProfileKind.MIMO_BYTE_CATEGORY_CANDIDATE
                            ? "legacy-bytes-unsupported-shape" : "legacy-bytes";
                    return new Estimate(legacy, identity, strategy, legacy, 0, messages.size(), 0);
                }

                if (kind == ProfileKind.MIMO_BYTE_CATEGORY_CANDIDATE) {
                    long margin = MIMO_CANDIDATE_FIXED_MARGIN_TOKENS;
                    long candidate = addExact(addExact(categoryBody, framing), margin);
                    return new Estimate(candidate, identity,
                            byteMessages == 0 ? "mimo-byte-category-candidate" : "mimo-mixed-category-and-bytes",
                            legacy, categoryMessages, byteMessages, margin);
                }

                long margin = Math.max(CATEGORY_FIXED_MARGIN_TOKENS, framing);
                long candidate = addExact(categoryBody, margin);
                long tokens = Math.min(candidate, legacy);
                String strategy = byteMessages == 0 ? "calibrated-category" : "mixed-category-and-bytes";
                if (tokens == legacy) strategy = "legacy-bytes-cap";
                return new Estimate(tokens, identity, strategy, legacy, categoryMessages, byteMessages, margin);
            } catch (RuntimeException failure) {
                return legacyFallback(messages);
            }
        }

        private Estimate legacyFallback(List<AiProviderRequest.Message> messages) {
            long bytes = 0;
            try {
                for (AiProviderRequest.Message message : messages) {
                    if (message == null || message.content() == null) {
                        throw new IllegalArgumentException("Message content is required");
                    }
                    bytes = addExact(bytes, message.content().getBytes(StandardCharsets.UTF_8).length);
                }
                long framing = Math.multiplyExact(MESSAGE_FRAMING_TOKENS, messages.size());
                long tokens = addExact(bytes, framing);
                return new Estimate(tokens, LEGACY_PROFILE_ID, "legacy-bytes-fallback", tokens,
                        0, messages.size(), 0);
            } catch (RuntimeException ignored) {
                throw new IllegalArgumentException("Unable to safely estimate Provider request input");
            }
        }
    }

    private static long estimateMimoCandidateBytes(String content) {
        long asciiBytes = 0;
        long nonAsciiBytes = 0;
        long byteEstimatedRuns = 0;
        int previousEnd = 0;
        Matcher riskyTokens = MIMO_BYTE_ESTIMATED_TOKEN.matcher(content);
        while (riskyTokens.find()) {
            byte[] safeBytes = content.substring(previousEnd, riskyTokens.start()).getBytes(StandardCharsets.UTF_8);
            for (byte value : safeBytes) {
                if ((value & 0x80) == 0) asciiBytes++;
                else nonAsciiBytes++;
            }
            byteEstimatedRuns = addExact(byteEstimatedRuns,
                    content.substring(riskyTokens.start(), riskyTokens.end()).getBytes(StandardCharsets.UTF_8).length);
            previousEnd = riskyTokens.end();
        }
        byte[] trailingBytes = content.substring(previousEnd).getBytes(StandardCharsets.UTF_8);
        for (byte value : trailingBytes) {
            if ((value & 0x80) == 0) asciiBytes++;
            else nonAsciiBytes++;
        }
        long weightedHundredths = addExact(Math.multiplyExact(asciiBytes, 35),
                Math.multiplyExact(nonAsciiBytes, 45));
        return addExact(Math.floorDiv(addExact(weightedHundredths, 99), 100), byteEstimatedRuns);
    }

    private static CategoryShape analyzeMimoCandidateShape(String text) {
        CategoryShape shape = analyzeCategoryShape(maskMimoByteEstimatedTokens(text));
        if (!shape.supported() || hasMimoUnsupportedSyntax(text)) return CategoryShape.unsupported();
        return shape;
    }

    private static String maskMimoByteEstimatedTokens(String text) {
        Matcher riskyTokens = MIMO_BYTE_ESTIMATED_TOKEN.matcher(text);
        StringBuilder masked = new StringBuilder(text.length());
        int previousEnd = 0;
        while (riskyTokens.find()) {
            masked.append(text, previousEnd, riskyTokens.start());
            masked.append(' ');
            previousEnd = riskyTokens.end();
        }
        return masked.append(text, previousEnd, text.length()).toString();
    }

    private static boolean hasMimoUnsupportedSyntax(String text) {
        String trimmed = text.stripLeading();
        if (trimmed.startsWith("```") || trimmed.startsWith("~~~")
                || text.contains("```") || text.contains("~~~")) return true;
        if (text.matches("(?s).*(?:=>|===|!==|:=|\\+\\+|--|\\b(?:function|class|const|let|var|return|import|export|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\\b).*")) {
            return true;
        }
        return text.matches("(?s).*\\b[A-Za-z]\\s*[=<>+*/^]{1,3}\\s*[A-Za-z0-9].*");
    }

    /** Supports Han-dominant prose and structured Han-rich prompts; all non-Han bytes remain byte-estimated. */
    private static CategoryShape analyzeCategoryShape(String text) {
        if (text == null || text.isEmpty()) return CategoryShape.unsupported();
        long total = 0;
        long han = 0;
        long hanUtf8Bytes = 0;
        long punctuation = 0;
        long wordRun = 0;
        long maxWordRun = 0;
        long structural = 0;
        long quotes = 0;
        long colons = 0;
        long braces = 0;
        List<String> hanRuns = new ArrayList<>();
        StringBuilder currentHanRun = new StringBuilder();
        for (int offset = 0; offset < text.length();) {
            int codePoint = text.codePointAt(offset);
            offset += Character.charCount(codePoint);
            total++;
            if (codePoint > 0xFFFF) return CategoryShape.unsupported();
            if (Character.isISOControl(codePoint) && codePoint != '\n' && codePoint != '\r' && codePoint != '\t') {
                return CategoryShape.unsupported();
            }
            int type = Character.getType(codePoint);
            if (type == Character.NON_SPACING_MARK || type == Character.COMBINING_SPACING_MARK
                    || type == Character.ENCLOSING_MARK || type == Character.PRIVATE_USE
                    || type == Character.SURROGATE || type == Character.UNASSIGNED) {
                return CategoryShape.unsupported();
            }
            if (isHan(codePoint)) {
                han++;
                hanUtf8Bytes = addExact(hanUtf8Bytes, utf8Length(codePoint));
                currentHanRun.appendCodePoint(codePoint);
                wordRun = 0;
            } else if (isLatin(codePoint)) {
                flushHanRun(hanRuns, currentHanRun);
                wordRun++;
                maxWordRun = Math.max(maxWordRun, wordRun);
            } else if (Character.getType(codePoint) == Character.DECIMAL_DIGIT_NUMBER) {
                flushHanRun(hanRuns, currentHanRun);
                wordRun++;
                maxWordRun = Math.max(maxWordRun, wordRun);
            } else if (Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)) {
                flushHanRun(hanRuns, currentHanRun);
                wordRun = 0;
            } else if (isSupportedNonHan(codePoint)) {
                flushHanRun(hanRuns, currentHanRun);
                wordRun = 0;
                punctuation++;
                if ("{}[]():,\"'".indexOf(codePoint) >= 0) structural++;
                if (codePoint == '"' || codePoint == '\'') quotes++;
                if (codePoint == ':') colons++;
                if (codePoint == '{' || codePoint == '}') braces++;
            } else {
                return CategoryShape.unsupported();
            }
        }
        flushHanRun(hanRuns, currentHanRun);
        if (total < 16 || maxWordRun > 48) return CategoryShape.unsupported();
        double hanRatio = (double) han / total;
        String trimmed = text.stripLeading();
        boolean jsonShaped = trimmed.startsWith("{") || trimmed.startsWith("[");
        boolean ordinaryCjk = hanRatio >= 0.60;
        boolean cjkStructured = hanRatio >= 0.25 && structural >= 4 && quotes >= 4 && colons >= 1 && braces >= 2;
        boolean supported = jsonShaped
                ? hanRatio >= 0.25 && structural >= 4 && punctuation >= 8 && isJsonValue(trimmed)
                : ordinaryCjk || cjkStructured;
        return supported ? new CategoryShape(true, List.copyOf(hanRuns), hanUtf8Bytes) : CategoryShape.unsupported();
    }

    private static void flushHanRun(List<String> runs, StringBuilder current) {
        if (current.length() > 0) {
            runs.add(current.toString());
            current.setLength(0);
        }
    }

    private static boolean isJsonValue(String value) {
        try (JsonParser parser = JSON.createParser(value)) {
            JsonNode parsed = JSON.readTree(parser);
            return parsed != null && parser.nextToken() == null && (parsed.isObject() || parsed.isArray());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static boolean isHan(int codePoint) {
        return (codePoint >= 0x3400 && codePoint <= 0x4DBF)
                || (codePoint >= 0x4E00 && codePoint <= 0x9FFF)
                || (codePoint >= 0xF900 && codePoint <= 0xFAFF);
    }

    private static boolean isLatin(int codePoint) {
        return (codePoint >= 'A' && codePoint <= 'Z') || (codePoint >= 'a' && codePoint <= 'z')
                || (codePoint >= 0x00C0 && codePoint <= 0x024F
                && Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.LATIN);
    }

    private static boolean isSupportedNonHan(int codePoint) {
        if (codePoint == 0x00A5 || codePoint == 0x2022 || codePoint == 0x25CF || codePoint == 0x2192) return true;
        if (codePoint >= 0x21 && codePoint <= 0x7E) return true;
        int type = Character.getType(codePoint);
        if (type == Character.UPPERCASE_LETTER || type == Character.LOWERCASE_LETTER
                || type == Character.TITLECASE_LETTER || type == Character.MODIFIER_LETTER
                || type == Character.OTHER_LETTER) {
            return codePoint <= 0x024F && Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.LATIN;
        }
        return (codePoint >= 0x2000 && codePoint <= 0x303F
                || codePoint >= 0xFF00 && codePoint <= 0xFF65)
                && (type == Character.CONNECTOR_PUNCTUATION || type == Character.DASH_PUNCTUATION
                || type == Character.START_PUNCTUATION || type == Character.END_PUNCTUATION
                || type == Character.INITIAL_QUOTE_PUNCTUATION || type == Character.FINAL_QUOTE_PUNCTUATION
                || type == Character.OTHER_PUNCTUATION);
    }

    private static int utf8Length(int codePoint) {
        if (codePoint <= 0x7F) return 1;
        if (codePoint <= 0x7FF) return 2;
        return 3;
    }

    private static long addExact(long left, long right) {
        return Math.addExact(left, right);
    }

    public record Estimate(long inputTokens, String profileIdentity, String strategy,
                           long legacyBytesEstimate, int categoryMessages, int byteMessages,
                           long safetyMarginTokens) {
    }

    private record CategoryShape(boolean supported, List<String> hanRuns, long hanUtf8Bytes) {
        private static CategoryShape unsupported() {
            return new CategoryShape(false, List.of(), 0);
        }
    }

    private enum ProfileKind {
        LEGACY_BYTES,
        DEEPSEEK_CATEGORY,
        MIMO_BYTE_CATEGORY_CANDIDATE
    }
}
