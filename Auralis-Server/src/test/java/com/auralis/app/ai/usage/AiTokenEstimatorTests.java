package com.auralis.app.ai.usage;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiTokenEstimatorTests {
    private final AiTokenShadowEstimator estimator = new AiTokenShadowEstimator();

    @Test
    void classifiesSyntheticEnglishChineseCodeJsonAndUnicodeInputsDeterministically() {
        assertType("Short English sentence.", "LATIN");
        assertType("中文段落，包含繁體字。", "CJK");
        assertType("function add(a, b) { return a + b; }", "STRUCTURED");
        assertType("{\"title\":\"example\",\"items\":[1,2,3]}", "STRUCTURED");
        assertType("Καλημέρα Привет", "UNICODE");
        assertType("", "EMPTY");
    }

    @Test
    void producesNonnegativeStableEstimatesForShortLongMixedAndUnicodeText() {
        List<String> samples = List.of("x", "  \n", "a1中🙂", "字".repeat(20_000), "line\t".repeat(50_000));
        for (String sample : samples) {
            var first = estimator.estimate(List.of(sample));
            var second = estimator.estimate(List.of(sample));
            assertThat(first.tokens()).isGreaterThanOrEqualTo(0);
            assertThat(first.codePoints()).isGreaterThanOrEqualTo(0);
            assertThat(first.utf8Bytes()).isGreaterThanOrEqualTo(0);
            assertThat(first.textType()).isEqualTo(second.textType());
            assertThat(first.tokens()).isEqualTo(second.tokens());
            assertThat(first.utf8Bytes()).isEqualTo(sample.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        }
    }

    @Test
    void emptyAndNullInputListsStayZeroAndDoNotOverflow() {
        assertThat(estimator.estimate(List.of()).tokens()).isZero();
        assertThat(estimator.estimate(java.util.Arrays.asList("", null)).tokens()).isZero();
        assertThat(estimator.estimate(List.of("body")).framingTokens()).isZero();
    }

    @Test
    void appliesDeterministicFramingOnlyWhenTheRequestProjectionIncludesIt() {
        var bodyOnly = estimator.estimate(java.util.Arrays.asList("abc", null, "", "中文"));
        var messages = estimator.estimate(java.util.Arrays.asList("abc", null, "", "中文"), 16L);

        assertThat(messages.framingTokens()).isEqualTo(16L);
        assertThat(messages.tokens()).isEqualTo(bodyOnly.tokens() + 16L);
        assertThat(estimator.estimate(List.of("abc"), 4L).framingTokens()).isEqualTo(4L);
    }

    @Test
    void rejectsNegativeFramingProjection() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> estimator.estimate(List.of("body"), -1L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void assertType(String text, String expected) {
        assertThat(estimator.estimate(List.of(text)).textType()).isEqualTo(expected);
    }
}
