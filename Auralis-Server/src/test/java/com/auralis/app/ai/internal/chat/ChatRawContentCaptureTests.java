package com.auralis.app.ai.internal.chat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatRawContentCaptureTests {
    @TempDir
    Path tempDirectory;

    @Test
    void preservesDecodedContentExactlyAcrossChunksAndIterations() throws Exception {
        ChatRawContentCapture capture = new ChatRawContentCapture(true, tempDirectory, 1024);
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        var attempt = capture.beginAttempt(runId, attemptId);
        var iteration = attempt.beginIteration(UUID.randomUUID());
        String raw = "  ```json\r\n{\"label\":\"😀\"} \n```  ";
        int splitAfterHighSurrogate = raw.indexOf("😀") + 1;

        iteration.append(raw.substring(0, splitAfterHighSurrogate));
        iteration.append(raw.substring(splitAfterHighSurrogate));
        iteration.finish(true);

        Path file = onlyCaptureFile();
        assertArrayEquals(raw.getBytes(StandardCharsets.UTF_8), Files.readAllBytes(file));
        attempt.finish();
    }

    @Test
    void enforcesOneAttemptByteCapAndMarksTruncatedIteration() throws Exception {
        ChatRawContentCapture capture = new ChatRawContentCapture(true, tempDirectory, 7);
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        UUID thirdId = UUID.randomUUID();
        var attempt = capture.beginAttempt(runId, attemptId);

        var first = attempt.beginIteration(firstId);
        first.append("A😀");
        first.finish(true);
        var second = attempt.beginIteration(secondId);
        second.append("B😀");
        assertTrue(second.wasTruncated());
        second.finish(true);
        var third = attempt.beginIteration(thirdId);
        third.append("Q");
        third.finish(true);
        attempt.finish();

        assertEquals("A😀", Files.readString(fileFor(runId, attemptId, firstId), StandardCharsets.UTF_8));
        assertEquals("B", Files.readString(fileFor(runId, attemptId, secondId), StandardCharsets.UTF_8));
        assertEquals("Q", Files.readString(fileFor(runId, attemptId, thirdId), StandardCharsets.UTF_8));
    }

    @Test
    void disabledCaptureCreatesNoDirectoryOrFile() throws Exception {
        Path directory = tempDirectory.resolve("disabled");
        ChatRawContentCapture capture = new ChatRawContentCapture(false, directory, 32);
        var attempt = capture.beginAttempt(UUID.randomUUID(), UUID.randomUUID());
        var iteration = attempt.beginIteration(UUID.randomUUID());

        iteration.append("assistant output");
        iteration.finish(true);
        attempt.finish();

        assertFalse(Files.exists(directory));
    }

    @Test
    void capturesOnlyKnownDisplayToolArgumentsInAnIndexScopedLocalFile() throws Exception {
        ChatRawContentCapture capture = new ChatRawContentCapture(true, tempDirectory, 128);
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID iterationId = UUID.randomUUID();
        var attempt = capture.beginAttempt(runId, attemptId);
        var iteration = attempt.beginIteration(iterationId);
        assertTrue(iteration.beginToolArguments(1, "read_source_excerpt") == null);
        var tool = iteration.beginToolArguments(3, "render_steps");
        String arguments = "{\"title\":\"A\",\"items\":[{\"title\":\"B\"}]}";
        tool.append(arguments.substring(0, 12));
        tool.append(arguments.substring(12));
        tool.finish(true);
        iteration.finish(true);
        attempt.finish();

        Path file = tempDirectory.resolve(runId + "-" + attemptId + "-" + iterationId + "-tool-3.json");
        assertEquals(arguments, Files.readString(file, StandardCharsets.UTF_8));
        try (Stream<Path> files = Files.list(tempDirectory)) {
            assertEquals(1, files.count());
        }
    }

    @Test
    void markedTruncatedToolCaptureKeepsOnlyPrefixAndCannotBecomeComplete() throws Exception {
        ChatRawContentCapture capture = new ChatRawContentCapture(true, tempDirectory, 128);
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID iterationId = UUID.randomUUID();
        var attempt = capture.beginAttempt(runId, attemptId);
        var iteration = attempt.beginIteration(iterationId);
        var tool = iteration.beginToolArguments(4, "render_steps");

        tool.append("prefix");
        tool.markTruncated();
        tool.append("discarded suffix");
        tool.finish(true);
        iteration.finish(true);
        attempt.finish();

        Path file = tempDirectory.resolve(runId + "-" + attemptId + "-" + iterationId + "-tool-4.json");
        assertEquals("prefix", Files.readString(file, StandardCharsets.UTF_8));
        assertTrue(tool.wasTruncated());
    }

    @Test
    void storageFailureDoesNotEscapeAppendOrFinish() throws Exception {
        Path notDirectory = tempDirectory.resolve("file");
        Files.writeString(notDirectory, "occupied");
        ChatRawContentCapture capture = new ChatRawContentCapture(true, notDirectory, 32);
        var attempt = capture.beginAttempt(UUID.randomUUID(), UUID.randomUUID());
        var iteration = attempt.beginIteration(UUID.randomUUID());

        iteration.append("assistant output");
        iteration.finish(true);
        attempt.finish();

        assertEquals("occupied", Files.readString(notDirectory));
    }

    private Path onlyCaptureFile() throws Exception {
        try (Stream<Path> files = Files.list(tempDirectory)) {
            return files.filter(path -> path.toString().endsWith(".txt")).findFirst().orElseThrow();
        }
    }

    private Path fileFor(UUID runId, UUID attemptId, UUID iterationId) {
        return tempDirectory.resolve(runId + "-" + attemptId + "-" + iterationId + ".txt");
    }
}
