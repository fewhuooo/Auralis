package com.studycore.server.service.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.TokenStream;
import dev.langchain4j.service.V;
import dev.langchain4j.service.spring.AiService;

@AiService
public interface StudyCoreAssistant {

    @SystemMessage({
        "You are a helpful study assistant for StudyCore.",
        "You will answer user questions based on their knowledge blocks.",
        "Today's date is {{current_date}}."
    })
    String chat(@V("current_date") String currentDate, String userMessage);

    TokenStream chatStream(@V("current_date") String currentDate, String userMessage);
}
