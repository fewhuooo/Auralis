package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiInputTokenEstimatorTests {
    private static final String ENDPOINT = "https://api.deepseek.com";
    private static final String MODEL = "deepseek-v4-flash";
    private static final String MODE = AiInputTokenEstimator.MODE_CALIBRATED_CATEGORY;
    private static final String MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1";
    private static final String MIMO_MODEL = "mimo-v2.6-flash";
    private static final String MIMO_MODE = AiInputTokenEstimator.MODE_MIMO_BYTE_CATEGORY_CANDIDATE;

    @Test
    void resolverRequiresExactProviderOfficialEndpointAndModel() {
        assertThat(profile(AiProviderType.DEEPSEEK, ENDPOINT, MODEL).identity())
                .isEqualTo(AiInputTokenEstimator.CATEGORY_PROFILE_ID);
        assertThat(profile(AiProviderType.DEEPSEEK, "https://api.deepseek.com/v1", MODEL).identity())
                .isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(profile(AiProviderType.DEEPSEEK, "https://deepseek.com", MODEL).identity())
                .isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(profile(AiProviderType.OPENAI_COMPATIBLE, ENDPOINT, MODEL).identity())
                .isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(profile(AiProviderType.DEEPSEEK, ENDPOINT, "deepseek-v4-flash-latest").identity())
                .isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(AiInputTokenEstimator.resolve(AiProviderType.DEEPSEEK, ENDPOINT, MODEL,
                AiInputTokenEstimator.MODE_LEGACY_BYTES).identity())
                .isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
    }

    @Test
    void mixedProfileUsesBytesForEnglishSystemAndCategoryForSupportedCjkUser() {
        String system = "SYSTEM instructions are written in English and remain byte-estimated.";
        String user = "请根据以下资料整理结构化内容，说明主题关系和重点信息。".repeat(40);
        List<AiProviderRequest.Message> messages = List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                new AiProviderRequest.Message(AiMessageRole.USER, user));
        AiInputTokenEstimator.Estimate estimate = profile(AiProviderType.DEEPSEEK, ENDPOINT, MODEL)
                .estimate(messages);
        long legacy = system.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                + user.getBytes(java.nio.charset.StandardCharsets.UTF_8).length + 8;

        assertThat(estimate.profileIdentity()).isEqualTo(AiInputTokenEstimator.CATEGORY_PROFILE_ID);
        assertThat(estimate.strategy()).isEqualTo("mixed-category-and-bytes");
        assertThat(estimate.categoryMessages()).isEqualTo(1);
        assertThat(estimate.byteMessages()).isEqualTo(1);
        assertThat(estimate.safetyMarginTokens()).isEqualTo(64);
        assertThat(estimate.legacyBytesEstimate()).isEqualTo(legacy);
        assertThat(estimate.inputTokens()).isLessThan(legacy);
        String hanOnly = user.replace("，", "").replace("。", "");
        long hanBytes = hanOnly.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        long categoryBody = new AiTokenShadowEstimator().estimate(List.of(hanOnly), 0).tokens() * 2;
        long expected = Math.min(legacy, system.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                + user.getBytes(java.nio.charset.StandardCharsets.UTF_8).length - hanBytes + categoryBody + 64);
        assertThat(estimate.inputTokens()).isEqualTo(expected);
    }

    @Test
    void unsupportedUnicodeCodeAndHighEntropyLatinStayOnLegacyByteFallback() {
        String cjkWithEmoji = "中文内容需要保持原样🙂".repeat(8);
        String codeLike = "中文注释变量={value}; const state = payload + result;".repeat(10);
        String highEntropyLatin = "中文材料token=" + "QWxwaGFCZXRhMTIz".repeat(20);
        for (String text : List.of(cjkWithEmoji, codeLike, highEntropyLatin)) {
            AiInputTokenEstimator.Estimate estimate = profile(AiProviderType.DEEPSEEK, ENDPOINT, MODEL)
                    .estimate(List.of(new AiProviderRequest.Message(AiMessageRole.USER, text)));
            assertThat(estimate.strategy()).isEqualTo("legacy-bytes");
            assertThat(estimate.categoryMessages()).isZero();
            assertThat(estimate.inputTokens()).isEqualTo(text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length + 4);
        }
    }

    @Test
    void structuredJsonRequiresValidWholeMessageAndEnoughHanText() {
        String valid = "{\"title\":\"中文学习主题与重点\",\"summary\":\"总结资料中的核心关系和章节内容\"}";
        String invalid = valid + " trailing";
        var profile = profile(AiProviderType.DEEPSEEK, ENDPOINT, MODEL);

        var supported = profile.estimate(List.of(new AiProviderRequest.Message(AiMessageRole.USER, valid)));
        var unsupported = profile.estimate(List.of(new AiProviderRequest.Message(AiMessageRole.USER, invalid)));

        assertThat(supported.categoryMessages()).isEqualTo(1);
        assertThat(unsupported.categoryMessages()).isZero();
        assertThat(unsupported.inputTokens()).isEqualTo(invalid.getBytes(java.nio.charset.StandardCharsets.UTF_8).length + 4);
    }

    @Test
    void categoryCandidateIsNeverHigherThanLegacyAndFramingMarginIsAppliedOnce() {
        String user = "这是中文结构化内容。".repeat(100);
        var messages = List.of(new AiProviderRequest.Message(AiMessageRole.USER, user),
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, "英文系统指令".repeat(20)));
        AiInputTokenEstimator.Estimate estimate = profile(AiProviderType.DEEPSEEK, ENDPOINT, MODEL)
                .estimate(messages);

        assertThat(estimate.inputTokens()).isLessThanOrEqualTo(estimate.legacyBytesEstimate());
        assertThat(estimate.safetyMarginTokens()).isEqualTo(64);
        assertThat(estimate.inputTokens()).isGreaterThan(0);
    }

    @Test
    void mimoCandidateRequiresExactProviderEndpointModelAndOptInMode() {
        assertThat(mimoProfile(AiProviderType.OPENAI_COMPATIBLE, MIMO_ENDPOINT, MIMO_MODEL).identity())
                .isEqualTo(AiInputTokenEstimator.MIMO_CANDIDATE_PROFILE_ID);
        assertThat(mimoProfile(AiProviderType.OPENAI_COMPATIBLE, "https://api.xiaomimimo.com/v1/", MIMO_MODEL)
                .identity()).isEqualTo(AiInputTokenEstimator.MIMO_CANDIDATE_PROFILE_ID);
        assertThat(mimoProfile(AiProviderType.OPENAI_COMPATIBLE, "https://api.xiaomimimo.com", MIMO_MODEL)
                .identity()).isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(mimoProfile(AiProviderType.OPENAI_COMPATIBLE, "https://proxy.example/v1", MIMO_MODEL)
                .identity()).isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(mimoProfile(AiProviderType.OPENAI_COMPATIBLE, MIMO_ENDPOINT, "mimo-v2.6-flash-latest")
                .identity()).isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(AiInputTokenEstimator.resolve(AiProviderType.DEEPSEEK, MIMO_ENDPOINT, MIMO_MODEL, MIMO_MODE)
                .identity()).isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(AiInputTokenEstimator.resolve(AiProviderType.OPENAI_COMPATIBLE, MIMO_ENDPOINT, MIMO_MODEL,
                AiInputTokenEstimator.MODE_LEGACY_BYTES).identity())
                .isEqualTo(AiInputTokenEstimator.LEGACY_PROFILE_ID);
        assertThat(profile(AiProviderType.DEEPSEEK, ENDPOINT, MODEL).identity())
                .isEqualTo(AiInputTokenEstimator.CATEGORY_PROFILE_ID);
    }

    @Test
    void mimoCandidateAppliesWeightedUtf8ByteFormulaPlusFramingAndTraceBasedMargin() {
        String system = "System instructions remain on the byte estimate.";
        String user = "请根据资料总结重点，并说明章节内容之间的关系。这段普通中文说明文字用于检验候选估算。"
                .repeat(8) + " with a concise prose summary";
        var estimate = mimoProfile(AiProviderType.OPENAI_COMPATIBLE, MIMO_ENDPOINT, MIMO_MODEL).estimate(List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                new AiProviderRequest.Message(AiMessageRole.USER, user)));
        long expectedUser = weightedByteCandidate(user);
        long expected = system.getBytes(java.nio.charset.StandardCharsets.UTF_8).length + expectedUser
                + 8 + AiInputTokenEstimator.MIMO_CANDIDATE_FIXED_MARGIN_TOKENS;

        assertThat(estimate.profileIdentity()).isEqualTo(AiInputTokenEstimator.MIMO_CANDIDATE_PROFILE_ID);
        assertThat(estimate.strategy()).isEqualTo("mimo-mixed-category-and-bytes");
        assertThat(estimate.categoryMessages()).isEqualTo(1);
        assertThat(estimate.byteMessages()).isEqualTo(1);
        assertThat(estimate.safetyMarginTokens()).isEqualTo(64);
        assertThat(estimate.inputTokens()).isEqualTo(expected);
    }

    @Test
    void mimoCandidateUsesLegacyBytesForUnsupportedShapes() {
        List<String> unsupported = List.of(
                "中文内容需要保持原样🙂".repeat(8),
                ("请阅读代码并说明结构。const state = payload; ").repeat(8),
                ("请分析公式关系。x = y^2 + z; ").repeat(8));
        var profile = mimoProfile(AiProviderType.OPENAI_COMPATIBLE, MIMO_ENDPOINT, MIMO_MODEL);

        for (String text : unsupported) {
            var estimate = profile.estimate(List.of(new AiProviderRequest.Message(AiMessageRole.USER, text)));
            assertThat(estimate.strategy()).isEqualTo("legacy-bytes-unsupported-shape");
            assertThat(estimate.categoryMessages()).isZero();
            assertThat(estimate.safetyMarginTokens()).isZero();
            assertThat(estimate.inputTokens()).isEqualTo(
                    text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length + 4);
        }
    }

    @Test
    void mimoCandidateUsesByteEstimatesForUuidAndLongAsciiTokensInsideSupportedProse() {
        List<String> riskyTokens = List.of(
                "550e8400-e29b-41d4-a716-446655440000",
                "QWxwaGFCZXRhMTIzNDU2Nzg5",
                "a".repeat(64));
        var profile = mimoProfile(AiProviderType.OPENAI_COMPATIBLE, MIMO_ENDPOINT, MIMO_MODEL);

        for (String riskyToken : riskyTokens) {
            String text = ("请根据资料核对编号，并说明章节内容之间的关系。" + riskyToken + "。")
                    .repeat(8);
            long riskyBytes = (long) riskyToken.getBytes(java.nio.charset.StandardCharsets.UTF_8).length * 8;
            long safeCandidate = weightedByteCandidate(text.replace(riskyToken, ""));
            var estimate = profile.estimate(List.of(new AiProviderRequest.Message(AiMessageRole.USER, text)));

            assertThat(estimate.strategy()).isEqualTo("mimo-byte-category-candidate");
            assertThat(estimate.inputTokens()).isEqualTo(safeCandidate + riskyBytes + 4
                    + AiInputTokenEstimator.MIMO_CANDIDATE_FIXED_MARGIN_TOKENS);
        }
    }

    private AiInputTokenEstimator.Profile mimoProfile(AiProviderType provider, String endpoint, String model) {
        return AiInputTokenEstimator.resolve(provider, endpoint, model, MIMO_MODE);
    }

    private static long weightedByteCandidate(String text) {
        long ascii = 0;
        long nonAscii = 0;
        for (byte value : text.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            if ((value & 0x80) == 0) ascii++;
            else nonAscii++;
        }
        return Math.floorDiv(35 * ascii + 45 * nonAscii + 99, 100);
    }

    private AiInputTokenEstimator.Profile profile(AiProviderType provider, String endpoint, String model) {
        return AiInputTokenEstimator.resolve(provider, endpoint, model, MODE);
    }
}
