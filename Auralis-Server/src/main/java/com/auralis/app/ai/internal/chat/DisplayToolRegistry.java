package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiProviderToolDefinition;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Single allowlist for the Chat Agent's data and local display tools. */
public final class DisplayToolRegistry {
    public static final String RENDER_STEPS = "render_steps";
    public static final String RENDER_COMPARE = "render_compare";
    public static final String RENDER_ROADMAP = "render_roadmap";
    public static final String RENDER_CHART = "render_chart";
    public static final String RENDER_QUIZ = "render_quiz";
    public static final String RENDER_QUESTION = "render_question";
    public static final String NOT_EXECUTED_RETRY_HINT = "本工具尚未执行，并非不可用。修正前一个工具参数后，如仍需要，请重新调用本工具；不要重复已成功工具。";
    private static final Map<String, DisplayComponent> COMPONENTS = Map.of(
            RENDER_STEPS, DisplayComponent.STEPS, RENDER_COMPARE, DisplayComponent.COMPARE,
            RENDER_ROADMAP, DisplayComponent.ROADMAP, RENDER_CHART, DisplayComponent.CHART,
            RENDER_QUIZ, DisplayComponent.QUIZ, RENDER_QUESTION, DisplayComponent.QUESTION);
    private static final Set<String> DATA_TOOLS = Set.of(
            ChatReadTools.SEARCH, ChatReadTools.LIST_SOURCES,
            ChatReadTools.READ_EXCERPT, ChatReadTools.READ_SOURCE_OVERVIEW);

    private DisplayToolRegistry() {}

    public static boolean isDisplay(String name) { return name != null && COMPONENTS.containsKey(name); }
    public static boolean isKnown(String name) { return name != null && (isDisplay(name) || DATA_TOOLS.contains(name)); }
    public static DisplayComponent component(String name) { return name == null ? null : COMPONENTS.get(name); }

    public static List<AiProviderToolDefinition> definitions(List<AiProviderToolDefinition> dataTools) {
        return java.util.stream.Stream.concat(dataTools.stream(), java.util.stream.Stream.of(
                def(RENDER_STEPS, "用户要求展示流程时，或表达‘带我走一遍过程’、‘梳理流程’、‘追踪状态变化’等自然意图时优先使用；仅用于有序步骤、状态转换或因果链。普通并列清单仍用 Markdown。按顺序将每一步放入 items；卡片保持紧凑，作为结构骨架，标题简短、描述写简要结论。直觉、原因、推导、边界和难点放在 assistant 正文中继续解释。", """
                  {"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"},"items":{"type":"array","minItems":1,"items":{"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"}},"required":["title"],"additionalProperties":false}}},"required":["title","items"],"additionalProperties":false}
                  """),
                def(RENDER_COMPARE, "至少有两个对等对象，且需要按共同维度比较时使用；用户表达‘对比概念’、‘怎么选’、‘代价差异’等意图时优先考虑。没有真实可比对象时不要强行比较。每个 item 标题写一个维度，每个对象对应一个 entry，并在各维度中使用相同对象。卡片保持紧凑；更完整的解释写在 assistant 正文中。", """
                  {"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"},"items":{"type":"array","minItems":1,"items":{"type":"object","properties":{"title":{"type":"string","minLength":1},"entries":{"type":"array","minItems":2,"items":{"type":"object","properties":{"label":{"type":"string","minLength":1},"text":{"type":"string","minLength":1}},"required":["label","text"],"additionalProperties":false}}},"required":["title","entries"],"additionalProperties":false}}},"required":["title","items"],"additionalProperties":false}
                  """),
                def(RENDER_ROADMAP, "学习路线的阶段存在依赖关系时使用；用户表达‘规划学习路径’、‘先学什么’、‘拆解主题’等意图时优先考虑。不要把普通列表改名为路线图。按顺序将相互依赖的阶段放入 items。卡片保持紧凑，作为结构骨架，标题简短、描述写简要结论；理由和细节放在 assistant 正文中说明。", """
                  {"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"},"items":{"type":"array","minItems":1,"items":{"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"},"tag":{"type":"string"},"current":{"type":"boolean"}},"required":["title"],"additionalProperties":false}}},"required":["title","items"],"additionalProperties":false}
                  """),
                def(RENDER_CHART, "用户要求柱状图或占比图时使用，且数值必须由用户提供或有已收到的证据支持；不要编造数据。设置 chartType，每个类别对应一个 label/value 项；unit 为可选字段。", """
                  {"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"},"chartType":{"type":"string","enum":["bar","proportion"]},"unit":{"type":"string"},"items":{"type":"array","minItems":1,"items":{"type":"object","properties":{"label":{"type":"string","minLength":1},"value":{"type":"number","minimum":0}},"required":["label","value"],"additionalProperties":false}}},"required":["title","chartType","items"],"additionalProperties":false}
                  """),
                def(RENDER_QUIZ, "用户要求选择题练习时使用；即使没有点名卡片，只要用户要求考查、检查理解、练习或巩固概念，也使用本工具。主动学习交流中，完成核心概念后可以用一道有价值的选择题作为检查点。不要每轮机械追加，也不要用于局部澄清、误解后的补充讲解或纯导航/概览轮。提供 question、single/multiple 类型和至少两个 key 唯一的选项。可选 reference 为私有信息。", """
                  {"type":"object","properties":{"question":{"type":"string","minLength":1},"questionType":{"type":"string","enum":["single","multiple"]},"options":{"type":"array","minItems":2,"items":{"type":"object","properties":{"key":{"type":"string","minLength":1},"text":{"type":"string","minLength":1}},"required":["key","text"],"additionalProperties":false}},"reference":{"type":"object","properties":{"answer":{"type":"array","minItems":1,"items":{"type":"string"}},"explanation":{"type":"string","minLength":1}},"required":["answer"],"additionalProperties":false}},"required":["question","questionType","options"],"additionalProperties":false}
                  """),
                def(RENDER_QUESTION, "用户要求开放回答练习时使用；即使没有点名卡片，只要用户要求检查理解、练习、巩固概念或复述，也使用本工具。主动学习交流中，完成核心概念后可以用一个有价值的开放问题作为检查点。不要每轮机械追加，也不要用于局部澄清、误解后的补充讲解或纯导航/概览轮；自然的澄清问题不必制成卡片。提供 question 和可选 placeholder；可选私有 reference 应包含非空 points 或 answer。", """
                  {"type":"object","properties":{"question":{"type":"string","minLength":1},"placeholder":{"type":"string"},"reference":{"type":"object","properties":{"points":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}},"answer":{"type":"string","minLength":1},"explanation":{"type":"string","minLength":1}},"additionalProperties":false}},"required":["question"],"additionalProperties":false}
                  """)
        )).toList();
    }

    private static AiProviderToolDefinition def(String name, String description, String schema) {
        return new AiProviderToolDefinition(name, description, schema.strip());
    }
}
