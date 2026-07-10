package com.auralis.server.service.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.TokenStream;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import dev.langchain4j.service.spring.AiService;
import dev.langchain4j.service.spring.AiServiceWiringMode;

/**
 * 14.4 RAG-enabled assistant — contentRetriever is wired by LangChain4j Spring Boot auto-configuration.
 * The @AiService annotation with wiringMode=EXPLICIT ensures that the ContentRetriever bean
 * and the correct ChatLanguageModel are injected.
 */
@AiService(wiringMode = AiServiceWiringMode.EXPLICIT, chatModel = "dynamicChatModel", streamingChatModel = "streamingChatLanguageModel", contentRetriever = "contentRetriever")
public interface AuralisAssistant {

    @SystemMessage({
        "You are a helpful study assistant for Auralis.",
        "You will answer user questions based on their knowledge blocks.",
        "If the provided context contains relevant information, use it to answer accurately.",
        "If the provided context is irrelevant or empty, answer based on your general knowledge directly WITHOUT mentioning the provided context or its lack thereof.",
        "Today's date is {{current_date}}."
    })
    String chat(@V("current_date") String currentDate, @UserMessage String userMessage);

    @SystemMessage({
        "You are a helpful study assistant for Auralis.",
        "You will answer user questions based on their knowledge blocks.",
        "If the provided context contains relevant information, use it to answer accurately.",
        "If the provided context is irrelevant or empty, answer based on your general knowledge directly WITHOUT mentioning the provided context or its lack thereof.",
        "Today's date is {{current_date}}."
    })
    TokenStream chatStream(@V("current_date") String currentDate, @UserMessage String userMessage);
}
