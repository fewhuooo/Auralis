package com.studycore.server.service.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.spring.AiService;
import dev.langchain4j.service.spring.AiServiceWiringMode;

@AiService(wiringMode = AiServiceWiringMode.EXPLICIT, chatModel = "dynamicChatModel")
public interface KnowledgeExtractor {

    @SystemMessage("You are an expert at extracting structured knowledge from raw text, PDFs, or OCR output. Extract the core concepts into a structured JSON representation.")
    @UserMessage("Extract knowledge blocks from the following text: {{text}}")
    String extractKnowledgeBlocks(String text);

    @SystemMessage("你是一个任务分析助手。请从用户输入的口语化备忘录中提取出具体的“待办任务”。返回包含 tasks 数组和 summary 的 JSON 格式。")
    @UserMessage("备忘录内容：\n{{text}}")
    String extractTasks(String text);

    @SystemMessage("你是一个笔记整理专家。请将用户提供的凌乱手写/扫描文本，整理成条理清晰的结构化 Markdown，保留重要标题和列表。直接返回 Markdown 文本，不要加多余的废话。")
    @UserMessage("杂乱文本如下：\n{{text}}")
    String convertHandwriting(String text);
}
