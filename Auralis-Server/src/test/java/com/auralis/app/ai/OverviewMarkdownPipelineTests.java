package com.auralis.app.ai;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.ArrayList;
import static org.assertj.core.api.Assertions.*;

class OverviewMarkdownPipelineTests {
    @ParameterizedTest
    @EnumSource(OverviewMode.class)
    void routesCleanedOriginalAndOutlineWithoutInventingSourceEvidence(OverviewMode mode) {
        var calls = new ArrayList<OverviewMarkdownPipeline.Stage>();
        var result = new OverviewMarkdownPipeline(JsonMapper.builder().build()).generate("封面\n实际正文😀", "材料", mode, null,
                (stage, system, user, minimumOutput) -> {
                    calls.add(stage);
                    if (stage == OverviewMarkdownPipeline.Stage.CLEAN) {
                        assertThat(user).contains("[L1] 封面", "[L2] 实际正文😀");
                        return "{\"exclusions\":[{\"startLine\":1,\"endLine\":1,\"category\":\"COVER_COPYRIGHT\",\"reason\":\"封面\"}]}";
                    }
                    if (stage == OverviewMarkdownPipeline.Stage.OUTLINE) {
                        assertThat(user).isEqualTo("实际正文😀");
                        return "# 主线\n实际内容";
                    }
                    assertThat(user).contains("实际正文😀", "# 主线\n实际内容").doesNotContain("封面");
                    return "简明总结";
                }, (stage, system, user, minimumOutput) -> true);
        assertThat(result.schemaVersion()).isEqualTo(2);
        assertThat(result.outlineMarkdown()).isEqualTo(mode == OverviewMode.SUMMARY ? null : "# 主线\n实际内容");
        assertThat(result.summaryMarkdown()).isEqualTo(mode == OverviewMode.OUTLINE ? null : "简明总结");
        assertThat(calls).hasSize(mode == OverviewMode.OUTLINE ? 2 : 3);
    }

    @ParameterizedTest
    @CsvSource({"10000,1200～1600", "10001,3000～4000"})
    void picksSummaryTargetFromCleanedCodePoints(int codePoints, String target) {
        String body = "字".repeat(codePoints - 1) + "😀";
        String outline = "# 主线";
        String instruction = "面向初学者";
        new OverviewMarkdownPipeline(JsonMapper.builder().build()).generate(
                "排除封面\n" + body, "材料", OverviewMode.ALL, instruction, (stage, system, user, minimumOutput) -> {
                    if (stage == OverviewMarkdownPipeline.Stage.CLEAN) {
                        return "{\"exclusions\":[{\"startLine\":1,\"endLine\":1,\"category\":\"COVER_COPYRIGHT\",\"reason\":\"封面\"}]}";
                    }
                    assertThat(system).endsWith("用户对表达重点和语言的要求（不得突破原文事实边界）：\n" + instruction);
                    if (stage == OverviewMarkdownPipeline.Stage.OUTLINE) {
                        assertThat(user).isEqualTo(body);
                        return outline;
                    }
                    assertThat(system).contains("篇幅约" + target + "字符");
                    assertThat(minimumOutput).isEqualTo(target.startsWith("1200") ? 4_112L : 10_512L);
                    assertThat(user).isEqualTo("【原文开始】\n" + body + "\n【原文结束】\n\n【重点大纲开始】\n"
                            + outline + "\n【重点大纲结束】");
                    return "总结";
                }, (stage, system, user, minimumOutput) -> true);
    }

    @Test
    void summaryBatchesWhenCleanAndOutlineStillFit() {
        var calls = new ArrayList<OverviewMarkdownPipeline.Stage>();
        var result = new OverviewMarkdownPipeline(JsonMapper.builder().build()).generate(
                "封面\n数据库事务保留一致性。", "材料", OverviewMode.ALL, null,
                (stage, system, user, minimumOutput) -> {
                    calls.add(stage);
                    return switch (stage) {
                        case CLEAN -> """
                                {"exclusions":[{"startLine":1,"endLine":1,"category":"COVER_COPYRIGHT","reason":"封面"}]}
                                """;
                        case OUTLINE -> {
                            assertThat(user).isEqualTo("数据库事务保留一致性。");
                            yield "# 数据库\n## 事务\n- 一致性";
                        }
                        case SUMMARY_MAP -> {
                            assertThat(user).contains("G01", "数据库事务保留一致性。").doesNotContain("封面");
                            yield """
                                    {"sections":[{"topicId":"G01","points":[{"keyPoint":"事务保留一致性","explanation":""}]}]}
                                    """;
                        }
                        case SUMMARY_MERGE -> {
                            assertThat(user).contains("事务保留一致性");
                            yield "## 事务\n数据库事务保留一致性。";
                        }
                        default -> throw new AssertionError("Unexpected stage " + stage);
                    };
                }, (stage, system, user, minimumOutput) -> stage != OverviewMarkdownPipeline.Stage.SUMMARY);

        assertThat(calls).containsExactly(OverviewMarkdownPipeline.Stage.CLEAN, OverviewMarkdownPipeline.Stage.OUTLINE,
                OverviewMarkdownPipeline.Stage.SUMMARY_MAP, OverviewMarkdownPipeline.Stage.SUMMARY_MERGE);
        assertThat(result.outlineMarkdown()).isEqualTo("# 数据库\n## 事务\n- 一致性");
        assertThat(result.summaryMarkdown()).isEqualTo("## 事务\n数据库事务保留一致性。");
    }

    @Test
    void routedSummarySplitsAnAnalysisLineTooLargeForItsPrompt() {
        String body = "前😀后";
        var summaryParts = new ArrayList<String>();
        var result = new OverviewMarkdownPipeline(JsonMapper.builder().build()).generate(
                body, "材料", OverviewMode.ALL, null,
                (stage, system, user, minimumOutput) -> switch (stage) {
                    case CLEAN -> "{\"exclusions\":[]}";
                    case OUTLINE_MAP -> """
                            {"topics":[{"title":"议题","scope":"正文","ranges":[[1,1]]}]}
                            """;
                    case OUTLINE_MERGE -> """
                            {"title":"材料","topics":[{"title":"议题","items":["正文"],"evidence":["W01.T01"]}]}
                            """;
                    case SUMMARY_MAP -> {
                        assertThat(user).contains("G01");
                        var sourceLines = user.lines().filter(line -> line.startsWith("[L1] ")).toList();
                        assertThat(sourceLines).hasSize(1);
                        summaryParts.add(sourceLines.getFirst().substring("[L1] ".length()));
                        yield """
                                {"sections":[{"topicId":"G01","points":[{"keyPoint":"正文","explanation":""}]}]}
                                """;
                    }
                    case SUMMARY_MERGE -> "## 议题\n正文";
                    default -> throw new AssertionError("Unexpected stage " + stage);
                }, (stage, system, user, minimumOutput) -> switch (stage) {
                    case OUTLINE -> false;
                    case SUMMARY_MAP -> user.contains("[L1] 前\n") || user.contains("[L1] 😀\n")
                            || user.contains("[L1] 后\n");
                    default -> true;
                });

        assertThat(summaryParts).containsExactly("前", "😀", "后");
        assertThat(result.summaryMarkdown()).isEqualTo("## 议题\n正文");
    }

    @Test
    void invalidCleanupStopsBeforeOutline() {
        var calls = new ArrayList<OverviewMarkdownPipeline.Stage>();
        assertThatThrownBy(() -> new OverviewMarkdownPipeline(JsonMapper.builder().build()).generate("正文", "材料", OverviewMode.ALL, null,
                (stage, system, user, minimumOutput) -> { calls.add(stage); return "not JSON"; },
                (stage, system, user, minimumOutput) -> true))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class);
        assertThat(calls).containsExactly(OverviewMarkdownPipeline.Stage.CLEAN);
    }
}
