package com.auralis.app.ai.usage;

import java.util.List;

/** Base character-category arithmetic; calibrated admission profiles add shape guards and a safety margin. */
final class AiTokenShadowEstimator {
    private static final long SCALE = 100;

    Estimate estimate(List<String> texts) {
        return estimate(texts, 0L);
    }

    Estimate estimate(List<String> texts, long framingTokens) {
        if (framingTokens < 0) throw new IllegalArgumentException("framingTokens must be nonnegative");
        long[] counts = new long[Category.values().length];
        long codePoints = 0;
        long utf8Bytes = 0;
        for (String text : texts) {
            if (text == null) continue;
            utf8Bytes = add(utf8Bytes, text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
            for (int offset = 0; offset < text.length();) {
                int point = text.codePointAt(offset);
                offset += Character.charCount(point);
                counts[category(point).ordinal()] = add(counts[category(point).ordinal()], 1);
                codePoints = add(codePoints, 1);
            }
        }

        long weighted = 0;
        for (Category category : Category.values()) {
            weighted = add(weighted, multiply(counts[category.ordinal()], category.weight));
        }
        long bodyTokens = weighted == 0 ? 0 : 1 + (weighted - 1) / SCALE;
        long tokens = add(bodyTokens, framingTokens);
        return new Estimate(tokens, codePoints, utf8Bytes, label(counts), framingTokens, counts);
    }

    private Category category(int codePoint) {
        if (Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)) return Category.WHITESPACE;
        int type = Character.getType(codePoint);
        if (type == Character.DECIMAL_DIGIT_NUMBER) return Category.DIGIT;
        if (type == Character.UPPERCASE_LETTER || type == Character.LOWERCASE_LETTER
                || type == Character.TITLECASE_LETTER || type == Character.MODIFIER_LETTER
                || type == Character.OTHER_LETTER) {
            Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
            return switch (script) {
                case HAN, HIRAGANA, KATAKANA, HANGUL -> Category.CJK;
                case LATIN -> Category.LATIN;
                default -> Category.OTHER;
            };
        }
        if (type == Character.CONNECTOR_PUNCTUATION || type == Character.DASH_PUNCTUATION
                || type == Character.START_PUNCTUATION || type == Character.END_PUNCTUATION
                || type == Character.INITIAL_QUOTE_PUNCTUATION || type == Character.FINAL_QUOTE_PUNCTUATION
                || type == Character.OTHER_PUNCTUATION || type == Character.MATH_SYMBOL
                || type == Character.CURRENCY_SYMBOL || type == Character.MODIFIER_SYMBOL
                || type == Character.OTHER_SYMBOL) return Category.PUNCTUATION;
        return Category.OTHER;
    }

    private String label(long[] counts) {
        long total = 0;
        long cjk = counts[Category.CJK.ordinal()];
        long latin = counts[Category.LATIN.ordinal()];
        long punctuation = counts[Category.PUNCTUATION.ordinal()];
        long other = counts[Category.OTHER.ordinal()];
        for (long count : counts) total = add(total, count);
        if (total == 0) return "EMPTY";
        if (punctuation >= 4 && punctuation >= 1 + (total - 1) / 8) return "STRUCTURED";
        if (cjk >= 1 + (total - 1) / 2) return "CJK";
        if (latin >= 1 + (total - 1) / 2) return "LATIN";
        if (other >= 1 + (total - 1) / 2) return "UNICODE";
        return "MIXED";
    }

    private long multiply(long left, int right) {
        if (left == 0) return 0;
        if (left > Long.MAX_VALUE / right) return Long.MAX_VALUE;
        return left * right;
    }

    private long add(long left, long right) {
        if (right > Long.MAX_VALUE - left) return Long.MAX_VALUE;
        return left + right;
    }

    private enum Category {
        LATIN(25), CJK(100), DIGIT(30), WHITESPACE(12), PUNCTUATION(35), OTHER(65);
        private final int weight;
        Category(int weight) { this.weight = weight; }
    }

    record Estimate(long tokens, long codePoints, long utf8Bytes, String textType,
                    long framingTokens, long[] categories) {
        Estimate {
            categories = categories.clone();
        }

        long categoryCount(int ordinal) { return categories[ordinal]; }
    }
}
