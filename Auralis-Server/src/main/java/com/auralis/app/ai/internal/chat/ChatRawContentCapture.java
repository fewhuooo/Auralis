package com.auralis.app.ai.internal.chat;

import com.auralis.app.shared.config.AuralisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Optional local-only capture of decoded assistant content and display-tool argument deltas. */
@Component
public final class ChatRawContentCapture {
    private static final Logger LOGGER = LoggerFactory.getLogger(ChatRawContentCapture.class);

    private final boolean enabled;
    private final Path directory;
    private final long maxBytesPerAttempt;

    @Autowired
    public ChatRawContentCapture(AuralisProperties properties,
            @Value("${auralis.ai.chat-agent.raw-content-capture-enabled:false}") boolean enabled,
            @Value("${auralis.ai.chat-agent.raw-content-capture-directory:/tmp/auralis-chat-diagnostics}") String directory) {
        this(enabled, Path.of(directory), properties.ai().providerMaxResponseBytes());
    }

    ChatRawContentCapture(boolean enabled, Path directory, long maxBytesPerAttempt) {
        if (maxBytesPerAttempt < 1) throw new IllegalArgumentException("Capture byte limit must be positive");
        this.enabled = enabled;
        this.directory = directory.toAbsolutePath().normalize();
        this.maxBytesPerAttempt = maxBytesPerAttempt;
    }

    public AttemptCapture beginAttempt(UUID runId, UUID attemptId) {
        return new AttemptCapture(runId, attemptId);
    }

    public boolean enabled() { return enabled; }

    public final class AttemptCapture {
        private final UUID runId;
        private final UUID attemptId;
        private final List<IterationCapture> iterations = new ArrayList<>();
        private long bytesWritten;
        private boolean finished;

        private AttemptCapture(UUID runId, UUID attemptId) {
            this.runId = runId;
            this.attemptId = attemptId;
        }

        public synchronized IterationCapture beginIteration(UUID iterationId) {
            IterationCapture capture = new IterationCapture(this, iterationId);
            if (!finished) iterations.add(capture);
            else capture.finish(false);
            return capture;
        }

        public synchronized void finish() {
            if (finished) return;
            finished = true;
            for (IterationCapture iteration : List.copyOf(iterations)) iteration.finish(false);
            iterations.clear();
        }
    }

    public final class IterationCapture {
        private final AttemptCapture attempt;
        private final UUID iterationId;
        private final Path file;
        private OutputStream output;
        private long bytesWritten;
        private boolean truncated;
        private boolean ioFailed;
        private boolean finished;
        private boolean captureAttempted;
        private Character pendingHighSurrogate;
        private final java.util.Map<Integer, ToolArgumentsCapture> toolCaptures = new java.util.LinkedHashMap<>();

        private IterationCapture(AttemptCapture attempt, UUID iterationId) {
            this.attempt = attempt;
            this.iterationId = iterationId;
            this.file = directory.resolve(attempt.runId + "-" + attempt.attemptId + "-" + iterationId + ".txt");
        }

        /** Append a decoded provider content delta verbatim; failures never escape into the Chat flow. */
        public void append(String content) {
            if (!enabled || content == null || content.isEmpty()) return;
            synchronized (attempt) {
                if (finished || ioFailed || truncated) return;
                try {
                    StringBuilder joined = new StringBuilder();
                    if (pendingHighSurrogate != null) {
                        joined.append(pendingHighSurrogate);
                        pendingHighSurrogate = null;
                    }
                    joined.append(content);
                    if (Character.isHighSurrogate(joined.charAt(joined.length() - 1))) {
                        pendingHighSurrogate = joined.charAt(joined.length() - 1);
                        joined.setLength(joined.length() - 1);
                    }
                    writeCapped(joined);
                } catch (IOException | RuntimeException ignored) {
                    failIo();
                }
            }
        }

        /** Begin a local diagnostic stream for an allowlisted display tool's raw arguments. */
        public synchronized ToolArgumentsCapture beginToolArguments(int providerIndex, String toolName) {
            if (providerIndex < 0 || !DisplayToolRegistry.isDisplay(toolName)) return null;
            synchronized (attempt) {
                ToolArgumentsCapture existing = toolCaptures.get(providerIndex);
                if (existing != null) return existing;
                ToolArgumentsCapture capture = new ToolArgumentsCapture(this, providerIndex, toolName);
                if (!finished) toolCaptures.put(providerIndex, capture);
                else capture.finish(false);
                return capture;
            }
        }

        private void writeCapped(CharSequence content) throws IOException {
            if (content.length() == 0) return;
            ensureOpen();
            int index = 0;
            while (index < content.length()) {
                int codePoint = Character.codePointAt(content, index);
                int chars = Character.charCount(codePoint);
                String value = new String(Character.toChars(codePoint));
                byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
                long remaining = maxBytesPerAttempt - attempt.bytesWritten;
                if (encoded.length > remaining) {
                    truncated = true;
                    return;
                }
                output.write(encoded);
                bytesWritten += encoded.length;
                attempt.bytesWritten += encoded.length;
                index += chars;
            }
        }

        private void ensureOpen() throws IOException {
            if (output != null) return;
            captureAttempted = true;
            Files.createDirectories(directory);
            output = Files.newOutputStream(file, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        }

        public void finish(boolean complete) {
            synchronized (attempt) {
                if (finished) return;
                finished = true;
                for (ToolArgumentsCapture capture : List.copyOf(toolCaptures.values())) capture.finish(false);
                toolCaptures.clear();
                if (pendingHighSurrogate != null && !ioFailed) {
                    try {
                        writeCapped(String.valueOf(pendingHighSurrogate));
                    } catch (IOException | RuntimeException ignored) {
                        failIo();
                    }
                    pendingHighSurrogate = null;
                }
                if (output != null) {
                    try {
                        output.close();
                    } catch (IOException | RuntimeException ignored) {
                        failIo();
                    }
                    output = null;
                }
                if (enabled) {
                    String path = captureAttempted ? file.toString() : "none";
                    LOGGER.info("CHAT_RAW_CONTENT_CAPTURE runId={} attemptId={} iterationId={} path={} bytes={} complete={} truncated={}",
                            attempt.runId, attempt.attemptId, iterationId, path, bytesWritten,
                            complete && !ioFailed && !truncated, truncated);
                }
                attempt.iterations.remove(this);
            }
        }

        public final class ToolArgumentsCapture {
            private final IterationCapture iteration;
            private final int providerIndex;
            private final String toolName;
            private final Path toolFile;
            private OutputStream toolOutput;
            private long toolBytes;
            private boolean toolTruncated;
            private boolean toolIoFailed;
            private boolean toolFinished;
            private boolean toolCaptureAttempted;

            private ToolArgumentsCapture(IterationCapture iteration, int providerIndex, String toolName) {
                this.iteration = iteration;
                this.providerIndex = providerIndex;
                this.toolName = toolName;
                this.toolFile = directory.resolve(attempt.runId + "-" + attempt.attemptId + "-" + iterationId
                        + "-tool-" + providerIndex + ".json");
            }

            public void append(String fragment) {
                if (!enabled || fragment == null || fragment.isEmpty()) return;
                synchronized (attempt) {
                    if (toolFinished || toolTruncated || toolIoFailed) return;
                    try {
                        Files.createDirectories(directory);
                        if (toolOutput == null) {
                            toolCaptureAttempted = true;
                            toolOutput = Files.newOutputStream(toolFile, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                        }
                        byte[] bytes = fragment.getBytes(StandardCharsets.UTF_8);
                        long remaining = maxBytesPerAttempt - attempt.bytesWritten;
                        if (bytes.length > remaining) {
                            toolTruncated = true;
                            return;
                        }
                        toolOutput.write(bytes);
                        toolBytes += bytes.length;
                        attempt.bytesWritten += bytes.length;
                    } catch (IOException | RuntimeException ignored) {
                        toolIoFailed = true;
                        closeToolOutput();
                    }
                }
            }

            public void markTruncated() {
                synchronized (attempt) {
                    if (!toolFinished) toolTruncated = true;
                }
            }

            boolean wasTruncated() {
                synchronized (attempt) { return toolTruncated; }
            }

            public void finish(boolean complete) {
                synchronized (attempt) {
                    if (toolFinished) return;
                    toolFinished = true;
                    closeToolOutput();
                    if (enabled) {
                        LOGGER.info("CHAT_RAW_TOOL_ARGUMENTS_CAPTURE runId={} attemptId={} iterationId={} providerIndex={} toolName={} path={} bytes={} complete={} truncated={}",
                                attempt.runId, attempt.attemptId, iterationId, providerIndex, toolName,
                                toolCaptureAttempted ? toolFile.toString() : "none", toolBytes,
                                complete && !toolIoFailed && !toolTruncated, toolTruncated);
                    }
                    iteration.toolCaptures.remove(providerIndex, this);
                }
            }

            private void closeToolOutput() {
                if (toolOutput == null) return;
                try { toolOutput.close(); } catch (IOException | RuntimeException ignored) { toolIoFailed = true; }
                toolOutput = null;
            }
        }

        boolean wasTruncated() {
            synchronized (attempt) { return truncated; }
        }

        private void failIo() {
            ioFailed = true;
            if (output != null) {
                try {
                    output.close();
                } catch (IOException | RuntimeException ignored) {
                    // Preserve the original Chat result when diagnostic storage is unavailable.
                }
                output = null;
            }
        }
    }
}
