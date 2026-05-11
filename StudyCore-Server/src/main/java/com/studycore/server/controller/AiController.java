package com.studycore.server.controller;

import com.studycore.server.service.ai.StudyCoreAssistant;
import com.studycore.server.service.ai.KnowledgeExtractor;
import com.studycore.server.service.ai.TaskScheduler;
import lombok.RequiredArgsConstructor;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final StudyCoreAssistant assistant;
    private final KnowledgeExtractor knowledgeExtractor;
    private final TaskScheduler taskScheduler;

    @Data
    public static class ChatRequest {
        private String systemPrompt;
        private String message;
        private boolean requireJson;
    }

    @Data
    public static class TextRequest {
        private String text;
    }

    @Data
    public static class ContentRequest {
        private String content;
    }

    @PostMapping("/chat")
    public ResponseEntity<String> chat(@RequestBody ChatRequest req) {
        String response = assistant.chat(LocalDate.now().toString(), req.getMessage());
        return ResponseEntity.ok(response);
    }

    @GetMapping(value = "/chat", produces = "text/event-stream")
    public SseEmitter chatStream(@RequestParam String message) {
        SseEmitter emitter = new SseEmitter();
        assistant.chatStream(LocalDate.now().toString(), message)
                .onNext(token -> {
                    try {
                        emitter.send(token);
                    } catch (Exception e) {
                        emitter.completeWithError(e);
                    }
                })
                .onComplete(response -> {
                    try {
                        emitter.send(SseEmitter.event().name("complete").data(""));
                        emitter.complete();
                    } catch (Exception e) {
                        emitter.completeWithError(e);
                    }
                })
                .onError(emitter::completeWithError)
                .start();
        return emitter;
    }

    @PostMapping("/ingest")
    public ResponseEntity<String> ingestDocument(@RequestBody ContentRequest req) {
        String result = knowledgeExtractor.extractKnowledgeBlocks(req.getContent());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/extract-tasks")
    public ResponseEntity<String> extractTasks(@RequestBody TextRequest req) {
        String result = knowledgeExtractor.extractTasks(req.getText());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/convert-handwriting")
    public ResponseEntity<String> convertHandwriting(@RequestBody TextRequest req) {
        String result = knowledgeExtractor.convertHandwriting(req.getText());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/schedule-suggest")
    public ResponseEntity<String> scheduleSuggest(@RequestBody TextRequest req) {
        String result = taskScheduler.analyzeAndSchedule(req.getText());
        return ResponseEntity.ok(result);
    }
}
