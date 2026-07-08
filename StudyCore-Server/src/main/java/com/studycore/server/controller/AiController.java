package com.studycore.server.controller;

import com.studycore.server.service.DocumentIngestionService;
import com.studycore.server.service.ai.StudyCoreAssistant;
import com.studycore.server.service.ai.KnowledgeExtractor;
import com.studycore.server.service.ai.AiTaskScheduler;
import com.studycore.server.common.Result;
import lombok.RequiredArgsConstructor;
import lombok.Data;
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
    private final AiTaskScheduler taskScheduler;
    private final DocumentIngestionService ingestionService;

    @org.springframework.beans.factory.annotation.Value("${studycore.ingest.max-file-size-mb:50}")
    private int maxFileSizeMb;

    @Data
    public static class ChatRequest {
        private String systemPrompt;
        private String message;
        private boolean requireJson;
        private String subjectId;
        private String sourceFileName;
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
    public Result<String> chat(@RequestBody ChatRequest req) {
        String msg = req.getMessage();
        if (req.getSourceFileName() != null && !req.getSourceFileName().trim().isEmpty()) {
            msg = "[当前材料: " + req.getSourceFileName() + "]\n" + msg;
        }
        String response = assistant.chat(LocalDate.now().toString(), msg);
        return Result.success(response);
    }

    @GetMapping(value = "/chat", produces = "text/event-stream")
    public SseEmitter chatStream(
            @RequestParam String message,
            @RequestParam(required = false) String subjectId,
            @RequestParam(required = false) String sourceFileName) {
        // Use 0L for infinite timeout to prevent 30s AsyncRequestTimeoutException during LLM generation
        SseEmitter emitter = new SseEmitter(0L);
        String finalMessage = message;
        if (sourceFileName != null && !sourceFileName.trim().isEmpty()) {
            finalMessage = "[当前材料: " + sourceFileName + "]\n" + finalMessage;
        }
        assistant.chatStream(LocalDate.now().toString(), finalMessage)
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
    public Result<Map<String, Object>> ingestDocument(@RequestBody ContentRequest req) {
        // Also run the LLM extractor for structured output
        String llmResult = knowledgeExtractor.extractKnowledgeBlocks(req.getContent());

        // Run the full ingestion pipeline (split → embed → store)
        String source = req.getSource() != null ? req.getSource() : "文档导入";
        String subject = req.getSubject() != null ? req.getSubject() : "自动分类";
        List<String> blockIds = ingestionService.ingestText(req.getContent(), source, subject);

        return Result.success(Map.of(
                "llmExtraction", llmResult,
                "ingestedBlockIds", blockIds,
                "totalChunks", blockIds.size()
        ));
    }

    /**
     * 14.4 File upload ingestion — multipart file (PDF / DOCX / PPTX)
     */
    @PostMapping("/ingest/file")
    public Result<Map<String, Object>> ingestFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "subject", defaultValue = "文档导入") String subject) {
        try {
            // 15.7 Business-level file size validation
            long maxBytes = (long) maxFileSizeMb * 1024 * 1024;
            if (file.getSize() > maxBytes) {
                throw new IllegalArgumentException(
                        String.format("文件大小 %.1f MB 超过上限 %d MB，请压缩后重试",
                                file.getSize() / (1024.0 * 1024.0), maxFileSizeMb));
            }

            List<String> blockIds = ingestionService.ingestFile(
                    file.getBytes(),
                    file.getOriginalFilename(),
                    subject
            );
            return Result.success(Map.of(
                    "fileName", file.getOriginalFilename(),
                    "ingestedBlockIds", blockIds,
                    "totalChunks", blockIds.size()
            ));
        } catch (Exception e) {
            return Result.error(500, e.getMessage());
        }
    }

    @PostMapping("/extract-tasks")
    public Result<String> extractTasks(@RequestBody TextRequest req) {
        String result = knowledgeExtractor.extractTasks(req.getText());
        return Result.success(result);
    }

    @PostMapping("/convert-handwriting")
    public Result<String> convertHandwriting(@RequestBody TextRequest req) {
        String result = knowledgeExtractor.convertHandwriting(req.getText());
        return Result.success(result);
    }

    @PostMapping("/schedule-suggest")
    public Result<String> scheduleSuggest(@RequestBody TextRequest req) {
        String result = taskScheduler.analyzeAndSchedule(req.getText());
        return Result.success(result);
    }
}
