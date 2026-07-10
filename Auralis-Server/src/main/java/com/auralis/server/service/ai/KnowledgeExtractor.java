package com.auralis.server.service.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.spring.AiService;
import dev.langchain4j.service.spring.AiServiceWiringMode;

@AiService(wiringMode = AiServiceWiringMode.EXPLICIT, chatModel = "dynamicChatModel")
public interface KnowledgeExtractor {

    @SystemMessage("You are an expert at extracting structured knowledge from raw text, PDFs, or OCR output. Extract the core concepts into a structured JSON representation.")
    @UserMessage("Extract knowledge blocks from the following text: {{text}}")
    String extractKnowledgeBlocks(String text);

    @SystemMessage("You extract concrete todo tasks from short notes. Return JSON with tasks and summary fields.")
    @UserMessage("Note content:\n{{text}}")
    String extractTasks(String text);

    @SystemMessage("You organize messy handwriting or OCR text into clear structured Markdown. Preserve important headings and lists. Return only Markdown.")
    @UserMessage("Messy text:\n{{text}}")
    String convertHandwriting(String text);
}
