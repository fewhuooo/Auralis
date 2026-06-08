package com.studycore.server.service.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.spring.AiService;
import dev.langchain4j.service.spring.AiServiceWiringMode;

@AiService(wiringMode = AiServiceWiringMode.EXPLICIT, chatModel = "dynamicChatModel")
public interface AiTaskScheduler {

    @SystemMessage("You are an AI scheduler. Analyze the provided tasks and past cognitive load to recommend an optimal schedule. Identify if the user is overloaded.")
    @UserMessage("Analyze these tasks and provide scheduling recommendations: {{tasksJson}}")
    String analyzeAndSchedule(String tasksJson);
}
