package com.studycore.server.service.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.TokenStream;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import dev.langchain4j.service.spring.AiService;

/**
 * 14.4 RAG-enabled assistant — contentRetriever is wired by LangChain4j Spring Boot auto-configuration.
 * The @AiService annotation with wiringMode=AUTOMATIC ensures that the ContentRetriever bean
 * from LangChain4jConfig is automatically injected into this service.
 */
@AiService
public interface StudyCoreAssistant {

    @SystemMessage({
        "You are a helpful study assistant for StudyCore.",
        "You will answer user questions based on their knowledge blocks.",
        "If relevant context is provided from the knowledge base, use it to answer accurately.",
        "If no relevant context is found, answer based on your general knowledge and note that.",
        "Today's date is {{current_date}}."
    })
    String chat(@V("current_date") String currentDate, @UserMessage String userMessage);

    TokenStream chatStream(@V("current_date") String currentDate, @UserMessage String userMessage);
}
