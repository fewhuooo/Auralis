package com.studycore.server.controller;

import com.studycore.server.service.DocumentIngestionService;
import com.studycore.server.service.ai.StudyCoreAssistant;
import com.studycore.server.service.ai.KnowledgeExtractor;
import com.studycore.server.service.ai.TaskScheduler;
import lombok.RequiredArgsConstructor;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final StudyCoreAssistant assistant;
    private final KnowledgeExtractor knowledgeExtractor;
    private final TaskScheduler taskScheduler;
    private final DocumentIngestionService ingestionService;

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
        private String source;
        private String subject;
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

    /**
     * 14.4 Enhanced ingest — text content ingestion with full pipeline:
     * DocumentSplitter → EmbeddingModel → EmbeddingStore + PostgreSQL
     */
    @PostMapping("/ingest")
    public ResponseEntity<Map<String, Object>> ingestDocument(@RequestBody ContentRequest req) {
        // Also run the LLM extractor for structured output
        String llmResult = knowledgeExtractor.extractKnowledgeBlocks(req.getContent());

        // Run the full ingestion pipeline (split → embed → store)
        String source = req.getSource() != null ? req.getSource() : "文档导入";
        String subject = req.getSubject() != null ? req.getSubject() : "自动分类";
        List<String> blockIds = ingestionService.ingestText(req.getContent(), source, subject);

        return ResponseEntity.ok(Map.of(
                "llmExtraction", llmResult,
                "ingestedBlockIds", blockIds,
                "totalChunks", blockIds.size()
        ));
    }

    /**
     * 14.4 File upload ingestion — multipart file (PDF / DOCX / PPTX)
     */
    @PostMapping("/ingest/file")
    public ResponseEntity<Map<String, Object>> ingestFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "subject", defaultValue = "文档导入") String subject) {
        try {
            List<String> blockIds = ingestionService.ingestFile(
                    file.getBytes(),
                    file.getOriginalFilename(),
                    subject
            );
            return ResponseEntity.ok(Map.of(
                    "fileName", file.getOriginalFilename(),
                    "ingestedBlockIds", blockIds,
                    "totalChunks", blockIds.size()
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", e.getMessage()
            ));
        }
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
