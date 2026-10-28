package com.auralis.app.ai.diagnostics;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewTraceFileCollectorTests {
    private final Path temp = Path.of("D:/Temp/auralis-overview-trace-20261023/collector-tests")
            .resolve(UUID.randomUUID().toString());

    @BeforeEach
    void createEvidenceRoot() throws Exception { Files.createDirectories(temp); }

    @Test
    void writesIsolatedRunWithInertReportAndImmutableEventSnapshot() throws Exception {
        UUID owner = UUID.randomUUID();
        OverviewTraceFileCollector collector = new OverviewTraceFileCollector(temp, new ObjectMapper(), true);
        try {
            OverviewTraceRun run = collector.start(owner, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
            assertThat(run.runId()).isNotNull();
            var event = new OverviewTraceEvent(1, Instant.now(), "MODEL_OUTPUT", owner, run.runId(), null,
                    null, null, null, null, "ADAPTIVE_WRITE", 1, "RETURNED", Map.of("value", "one"));
            assertThatThrownBy(() -> event.fields().put("value", "changed"))
                    .isInstanceOf(UnsupportedOperationException.class);
            run.event(event.type(), event.step(), event.attempt(), event.outcome(), event.fields(),
                    Map.of("providerContent", "line 1 | <tag>\n````\nline 2"));
            run.finish("SUCCESS", null, Map.of());
            Path runDir = awaitRunDirectory(owner, run.runId());
            assertThat(Files.readString(runDir.resolve("events.ndjson"), StandardCharsets.UTF_8))
                    .contains("MODEL_OUTPUT", "providerContent", "runId");
            String report = Files.readString(runDir.resolve("report.md"), StandardCharsets.UTF_8);
            assertThat(report).contains("captureComplete: `true`", "providerContent", "<tag>");
            assertThat(Files.readString(runDir.resolve("summary.json"), StandardCharsets.UTF_8))
                    .contains("\"captureComplete\":true");
        } finally {
            collector.close();
        }
    }

    @Test
    void metadataOnlyRunDoesNotEvaluateOrPersistContentSupplier() throws Exception {
        OverviewTraceFileCollector collector = new OverviewTraceFileCollector(temp, new ObjectMapper(), false);
        AtomicInteger contentReads = new AtomicInteger();
        try {
            SafeOverviewTrace safe = SafeOverviewTrace.of(collector);
            OverviewTraceRun run = safe.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null);
            safe.event(run, "PROMPT", "MAP", 1, "PENDING", Map.of("model", "fixture"), () -> {
                contentReads.incrementAndGet();
                return Map.of("systemPrompt", "secret sample prompt");
            });
            safe.finish(run, "SUCCESS", null, Map.of());
            Path runDir = awaitRunDirectoryFromAnyOwner();
            assertThat(contentReads).hasValue(0);
            assertThat(Files.readString(runDir.resolve("events.ndjson"), StandardCharsets.UTF_8))
                    .contains("fixture").doesNotContain("secret sample prompt");
        } finally {
            collector.close();
        }
    }

    @Test
    void storageFailureIsFailOpenAndDisabledAdapterHasNoSideEffects() throws Exception {
        Path invalidRoot = temp.resolve("file-root");
        Files.writeString(invalidRoot, "not a directory");
        OverviewTraceFileCollector collector = new OverviewTraceFileCollector(invalidRoot, new ObjectMapper(), true);
        try {
            OverviewTraceRun run = collector.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null);
            assertThatCode(() -> {
                run.event("INPUT", "PARSED_SOURCE", null, "READY", Map.of("sourceId", UUID.randomUUID().toString()),
                        Map.of("parsedText", "fixture"));
                run.finish("SUCCESS", null, Map.of());
            }).doesNotThrowAnyException();
        } finally {
            collector.close();
        }

        AtomicInteger disabledContentReads = new AtomicInteger();
        SafeOverviewTrace disabled = SafeOverviewTrace.disabled();
        OverviewTraceRun noOp = disabled.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null);
        disabled.event(noOp, "PROMPT", "MAP", 1, "PENDING", Map.of(), () -> {
            disabledContentReads.incrementAndGet();
            return Map.of("systemPrompt", "disabled");
        });
        disabled.finish(noOp, "SUCCESS", null, Map.of());
        assertThat(disabledContentReads).hasValue(0);
    }

    @Test
    void oversizedUnicodeFieldIsTruncatedWithOriginalLengthAndRunCanFinish() throws Exception {
        UUID owner = UUID.randomUUID();
        OverviewTraceFileCollector collector = new OverviewTraceFileCollector(temp, new ObjectMapper(), true);
        try {
            OverviewTraceRun run = collector.start(owner, UUID.randomUUID(), UUID.randomUUID(), null);
            run.event("INPUT_SNAPSHOT", "PARSED_SOURCE", null, "READY", Map.of(), Map.of("parsedText", "界".repeat(400_000)));
            run.finish("SUCCESS", null, Map.of());
            Path runDir = awaitRunDirectory(owner, run.runId());
            byte[] events = Files.readAllBytes(runDir.resolve("events.ndjson"));
            assertThat(events.length).isLessThanOrEqualTo(2 * 1024 * 1024);
            assertThat(new String(events, StandardCharsets.UTF_8)).contains("TRACE TRUNCATED", "originalUtf8Bytes=1200000");
            assertThat(Files.readString(runDir.resolve("summary.json"), StandardCharsets.UTF_8))
                    .contains("\"captureComplete\":true");
        } finally {
            collector.close();
        }
    }

    @Test
    void shutdownMarksRunWithoutTerminalEventIncomplete() throws Exception {
        UUID owner = UUID.randomUUID();
        OverviewTraceFileCollector collector = new OverviewTraceFileCollector(temp, new ObjectMapper(), false);
        OverviewTraceRun run = collector.start(owner, UUID.randomUUID(), UUID.randomUUID(), null);
        run.event("INPUT_SNAPSHOT", "PARSED_SOURCE", null, "READY", Map.of("count", "1"), null);
        collector.close();
        Path runDir = awaitRunDirectory(owner, run.runId());
        assertThat(Files.readString(runDir.resolve("summary.json"), StandardCharsets.UTF_8))
                .contains("\"captureComplete\":false", "\"outcome\":\"INCOMPLETE\"");
        assertThat(Files.readString(runDir.resolve("report.md"), StandardCharsets.UTF_8))
                .contains("captureComplete: `false`");
    }

    private Path awaitRunDirectory(UUID owner, UUID run) throws Exception {
        Path path = temp.resolve(owner.toString()).resolve(run.toString());
        Instant deadline = Instant.now().plus(Duration.ofSeconds(3));
        while (Instant.now().isBefore(deadline) && !Files.exists(path.resolve("summary.json"))) Thread.sleep(20);
        assertThat(path.resolve("summary.json")).exists();
        return path;
    }

    private Path awaitRunDirectoryFromAnyOwner() throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(3));
        while (Instant.now().isBefore(deadline)) {
            try (var owners = Files.list(temp)) {
                for (Path owner : owners.filter(Files::isDirectory).toList()) {
                    try (var runs = Files.list(owner)) {
                        Path match = runs.filter(Files::isDirectory)
                                .filter(run -> Files.exists(run.resolve("summary.json"))).findFirst().orElse(null);
                        if (match != null) return match;
                    }
                }
            }
            Thread.sleep(20);
        }
        throw new AssertionError("trace run was not written");
    }
}
