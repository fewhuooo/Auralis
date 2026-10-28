package com.auralis.app.ai.diagnostics;

import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.FileVisitResult;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** Single-writer, bounded, fail-open file collector for opt-in test exports. */
public final class OverviewTraceFileCollector implements OverviewTrace, AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(OverviewTraceFileCollector.class);
    private static final int QUEUE_CAPACITY = 64;
    private static final int MAX_EVENT_BYTES = 1024 * 1024 - 1;
    private static final int MAX_FIELD_BYTES = 350 * 1024;
    private static final long MAX_RUN_BYTES = 32L * 1024 * 1024;
    private static final long MAX_ROOT_BYTES = 256L * 1024 * 1024;
    private static final long MAX_RUN_EVENT_BYTES = MAX_RUN_BYTES - 1024L * 1024;
    private static final long MAX_ROOT_EVENT_BYTES = MAX_ROOT_BYTES - 8L * 1024 * 1024;
    private static final Duration RETENTION = Duration.ofHours(24);
    private static final String MARKER = ".overview-trace-owner";
    private static final byte[] STOP = new byte[0];

    private final Path root;
    private final ObjectMapper mapper;
    private final boolean captureContent;
    private final ArrayBlockingQueue<byte[]> queue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    private final ConcurrentHashMap<UUID, AtomicLong> dropped = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, OverviewTraceEvent> pendingTerminals = new ConcurrentHashMap<>();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final AtomicBoolean rootPrepared = new AtomicBoolean();
    private final AtomicLong rootBytes = new AtomicLong();
    private final Thread writer;
    private volatile Path realRoot;

    public OverviewTraceFileCollector(Path root, ObjectMapper mapper, boolean captureContent) {
        this.root = root.toAbsolutePath().normalize();
        this.mapper = mapper;
        this.captureContent = captureContent;
        this.writer = new Thread(this::writeLoop, "overview-trace-file-writer");
        this.writer.setDaemon(true);
        this.writer.start();
    }

    @Override public boolean capturesContent() { return captureContent; }

    @Override
    public OverviewTraceRun start(UUID ownerId, UUID requestId, UUID generationId, UUID jobId) {
        if (closed.get() || ownerId == null) return OverviewTraceRun.NOOP;
        UUID runId = UUID.randomUUID();
        Run run = new Run(ownerId, runId, requestId, generationId, jobId);
        run.event("RUN_STARTED", "OVERVIEW", null, "STARTED", Map.of(), null);
        return run;
    }

    private final class Run implements OverviewTraceRun {
        private final UUID ownerId;
        private final UUID runId;
        private final UUID requestId;
        private final UUID initialGenerationId;
        private final UUID jobId;
        private final AtomicBoolean finished = new AtomicBoolean();
        private Run(UUID ownerId, UUID runId, UUID requestId, UUID generationId, UUID jobId) {
            this.ownerId = ownerId; this.runId = runId; this.requestId = requestId;
            this.initialGenerationId = generationId; this.jobId = jobId;
        }
        @Override public UUID runId() { return runId; }
        @Override public boolean capturesContent() { return captureContent; }
        @Override public void event(String type, String step, Integer attempt, String outcome,
                                    Map<String, String> metadata, Map<String, String> content) {
            if (finished.get() || closed.get()) return;
            LinkedHashMap<String, String> fields = new LinkedHashMap<>();
            if (metadata != null) metadata.forEach((key, value) -> putBounded(fields, key, value));
            if (content != null) content.forEach((key, value) -> putBounded(fields, "content." + key, value));
            UUID generationId = parseUuid(fields.remove("generationId"));
            enqueue(new OverviewTraceEvent(1, Instant.now(), type, ownerId, runId, requestId,
                    generationId == null ? initialGenerationId : generationId, jobId, parseUuid(fields.remove("taskId")),
                    parseUuid(fields.remove("reservationId")), step, attempt, outcome, fields));
        }
        @Override public void finish(String outcome, String failureCode, Map<String, String> metadata) {
            if (!finished.compareAndSet(false, true)) return;
            LinkedHashMap<String, String> fields = new LinkedHashMap<>();
            if (metadata != null) fields.putAll(metadata);
            if (failureCode != null) fields.put("failureCode", failureCode);
            UUID generationId = parseUuid(fields.remove("generationId"));
            enqueue(new OverviewTraceEvent(1, Instant.now(), "RUN_FINISHED", ownerId, runId, requestId,
                    generationId == null ? initialGenerationId : generationId, jobId, parseUuid(fields.remove("taskId")),
                    parseUuid(fields.remove("reservationId")), "OVERVIEW", null, outcome, fields));
        }
    }

    private void enqueue(OverviewTraceEvent event) {
        if (closed.get()) return;
        try {
            byte[] encoded = encodeBounded(event);
            if (!queue.offer(encoded)) {
                dropped.computeIfAbsent(event.runId(), ignored -> new AtomicLong()).incrementAndGet();
                if ("RUN_FINISHED".equals(event.type()) && pendingTerminals.size() < 128) {
                    pendingTerminals.putIfAbsent(event.runId(), event);
                }
            }
        } catch (RuntimeException exception) {
            dropped.computeIfAbsent(event.runId(), ignored -> new AtomicLong()).incrementAndGet();
            log.warn("Overview trace event could not be encoded; run={}", event.runId());
        }
    }

    private byte[] encodeBounded(OverviewTraceEvent event) {
        byte[] bytes = json(event).getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= MAX_EVENT_BYTES) return bytes;
        LinkedHashMap<String, String> fields = new LinkedHashMap<>(event.fields());
        List<String> keys = new ArrayList<>(fields.keySet());
        keys.sort(Comparator.comparingInt((String key) -> fields.get(key).length()).reversed());
        for (String key : keys) {
            String value = fields.get(key);
            int original = value.getBytes(StandardCharsets.UTF_8).length;
            fields.put(key, clipUtf8(value, Math.min(8192, Math.max(256, original / 4)))
                    + " [TRACE TRUNCATED; originalUtf8Bytes=" + original + "]");
            fields.put("truncated." + key, "true");
            bytes = json(copyWithFields(event, fields)).getBytes(StandardCharsets.UTF_8);
            if (bytes.length <= MAX_EVENT_BYTES) return bytes;
        }
        fields.clear();
        fields.put("captureIncomplete", "event exceeded 1 MiB; payload omitted");
        bytes = json(copyWithFields(event, fields)).getBytes(StandardCharsets.UTF_8);
        return bytes.length <= MAX_EVENT_BYTES ? bytes : ("{\"formatVersion\":1,\"type\":\"TRACE_EVENT_TRUNCATED\",\"runId\":\"" + event.runId() + "\"}").getBytes(StandardCharsets.UTF_8);
    }

    private OverviewTraceEvent copyWithFields(OverviewTraceEvent source, Map<String, String> fields) {
        return new OverviewTraceEvent(1, source.at(), source.type(), source.ownerId(), source.runId(),
                source.requestId(), source.generationId(), source.jobId(), source.taskId(), source.reservationId(),
                source.step(), source.attempt(), source.outcome(), fields);
    }

    private void writeLoop() {
        while (!closed.get() || !queue.isEmpty() || !pendingTerminals.isEmpty()) {
            try {
                byte[] next = queue.poll(200, TimeUnit.MILLISECONDS);
                if (next == null) {
                    OverviewTraceEvent terminal = pendingTerminals.entrySet().stream().findFirst()
                            .map(entry -> pendingTerminals.remove(entry.getKey())).orElse(null);
                    if (terminal != null) writeOne(encodeBounded(terminal));
                    continue;
                }
                if (next == STOP) break;
                writeOne(next);
            } catch (InterruptedException exception) {
                if (closed.get()) break;
            } catch (RuntimeException exception) {
                log.warn("Overview trace writer encountered an error; capture is incomplete", exception);
            }
        }
        markOpenRunsIncomplete();
    }

    private final Map<UUID, RunState> active = new ConcurrentHashMap<>();
    private void writeOne(byte[] bytes) {
        OverviewTraceEvent event;
        try { event = mapper.readValue(bytes, OverviewTraceEvent.class); }
        catch (Exception exception) { log.warn("Overview trace event could not be decoded"); return; }
        try {
            prepareRoot();
            Path directory = ownedDirectory(event.ownerId(), event.runId(), true);
            RunState state = active.get(event.runId());
            if (state == null) {
                if (active.size() >= 128) {
                    dropped.computeIfAbsent(event.runId(), ignored -> new AtomicLong()).incrementAndGet();
                    log.warn("Overview trace active-run limit reached; run={} capture is incomplete", event.runId());
                    return;
                }
                state = new RunState(directory);
                active.put(event.runId(), state);
            }
            long lost = dropped.getOrDefault(event.runId(), new AtomicLong()).get();
            if (lost > state.reportedDrops) {
                state.incomplete = true;
                state.reportedDrops = lost;
            }
            byte[] line = (new String(bytes, StandardCharsets.UTF_8) + "\n").getBytes(StandardCharsets.UTF_8);
            if (!reserveBytes(line.length, state, false)) {
                state.incomplete = true;
                log.warn("Overview trace storage budget reached; run={} capture is incomplete", event.runId());
                if ("RUN_FINISHED".equals(event.type())) writeTerminalArtifacts(event, state);
                return;
            }
            Files.write(directory.resolve("events.ndjson"), line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            state.bytes += line.length;
            state.events.add(event);
            if ("RUN_FINISHED".equals(event.type())) writeTerminalArtifacts(event, state);
        } catch (Exception exception) {
            AtomicLong count = dropped.computeIfAbsent(event.runId(), ignored -> new AtomicLong());
            count.incrementAndGet();
            log.warn("Overview trace storage failed; run={} capture is incomplete", event.runId());
        }
    }

    private boolean reserveBytes(long bytes, RunState state, boolean artifact) {
        long runLimit = artifact ? MAX_RUN_BYTES : MAX_RUN_EVENT_BYTES;
        long rootLimit = artifact ? MAX_ROOT_BYTES : MAX_ROOT_EVENT_BYTES;
        if (state.bytes + bytes > runLimit || rootBytes.get() + bytes > rootLimit) return false;
        rootBytes.addAndGet(bytes);
        return true;
    }

    private void prepareRoot() throws IOException {
        if (rootPrepared.get()) return;
        synchronized (rootPrepared) {
            if (rootPrepared.get()) return;
            if (Files.exists(root, LinkOption.NOFOLLOW_LINKS) && Files.isSymbolicLink(root)) {
                throw new IOException("Configured trace root may not be a symbolic link");
            }
            Files.createDirectories(root);
            realRoot = root.toRealPath(LinkOption.NOFOLLOW_LINKS);
            long bytes = 0;
            try (DirectoryStream<Path> owners = Files.newDirectoryStream(realRoot)) {
                for (Path ownerDir : owners) {
                    UUID ownerId = parseUuid(ownerDir.getFileName().toString());
                    if (ownerId == null || Files.isSymbolicLink(ownerDir)
                            || !Files.isDirectory(ownerDir, LinkOption.NOFOLLOW_LINKS)) continue;
                    try (DirectoryStream<Path> runs = Files.newDirectoryStream(ownerDir)) {
                        for (Path runDir : runs) {
                            UUID runId = parseUuid(runDir.getFileName().toString());
                            if (runId == null || Files.isSymbolicLink(runDir)
                                    || !Files.isDirectory(runDir, LinkOption.NOFOLLOW_LINKS)
                                    || !validMarker(runDir, ownerId, runId)) continue;
                            Instant modified = Files.getLastModifiedTime(runDir, LinkOption.NOFOLLOW_LINKS).toInstant();
                            if (modified.isBefore(Instant.now().minus(RETENTION))) {
                                deleteOwnedTree(runDir);
                                continue;
                            }
                            bytes += treeBytes(runDir);
                        }
                    }
                }
            }
            rootBytes.set(bytes);
            rootPrepared.set(true);
        }
    }

    private boolean validMarker(Path runDir, UUID owner, UUID run) {
        try {
            Path marker = runDir.resolve(MARKER);
            if (!Files.isRegularFile(marker, LinkOption.NOFOLLOW_LINKS)) return false;
            List<String> lines = Files.readAllLines(marker, StandardCharsets.UTF_8);
            return lines.size() == 3 && lines.get(0).equals("auralis-overview-trace-v1")
                    && lines.get(1).equals(owner.toString()) && lines.get(2).equals(run.toString());
        } catch (IOException exception) { return false; }
    }

    private long treeBytes(Path directory) throws IOException {
        AtomicLong total = new AtomicLong();
        Files.walkFileTree(directory, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (attrs.isRegularFile()) total.addAndGet(attrs.size());
                return FileVisitResult.CONTINUE;
            }
        });
        return total.get();
    }

    private void deleteOwnedTree(Path directory) throws IOException {
        Files.walkFileTree(directory, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.deleteIfExists(file);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult postVisitDirectory(Path dir, IOException error) throws IOException {
                if (error != null) throw error;
                Files.deleteIfExists(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private void writeTerminalArtifacts(OverviewTraceEvent terminal, RunState state) {
        try {
            long lost = dropped.getOrDefault(terminal.runId(), new AtomicLong()).get();
            state.incomplete |= lost > 0;
            String summary = summary(terminal, state, lost);
            String report = renderReport(state, terminal, lost);
            long artifactBytes = summary.getBytes(StandardCharsets.UTF_8).length + 1L
                    + report.getBytes(StandardCharsets.UTF_8).length;
            if (state.bytes + artifactBytes > MAX_RUN_BYTES || rootBytes.get() + artifactBytes > MAX_ROOT_BYTES) {
                state.incomplete = true;
                summary = summary(terminal, state, lost);
                report = renderIncompleteReport(terminal.runId());
            }
            writeBudgeted(state, "summary.json", summary + "\n");
            writeBudgeted(state, "report.md", report);
            active.remove(terminal.runId());
        } catch (Exception exception) {
            state.incomplete = true;
            log.warn("Overview trace summary could not be written; run={} capture is incomplete", terminal.runId());
        }
    }

    private String summary(OverviewTraceEvent terminal, RunState state, long lost) {
        long providerResponses = state.events.stream().filter(event -> "PROVIDER_RESPONSE".equals(event.type())).count();
        long knownTokenUsage = state.events.stream().filter(event -> "PROVIDER_RESPONSE".equals(event.type()))
                .filter(event -> event.fields().containsKey("inputTokens") && event.fields().containsKey("outputTokens")
                        && !event.fields().get("inputTokens").isBlank() && !event.fields().get("outputTokens").isBlank())
                .count();
        long confirmedDispatches = state.events.stream().filter(event -> "PROVIDER_DISPATCH".equals(event.type())).count();
        return mapper.writeValueAsString(Map.ofEntries(
                Map.entry("formatVersion", 1), Map.entry("ownerId", terminal.ownerId()),
                Map.entry("runId", terminal.runId()), Map.entry("outcome", terminal.outcome() == null ? "UNKNOWN" : terminal.outcome()),
                Map.entry("eventCount", state.events.size()), Map.entry("droppedEvents", lost),
                Map.entry("captureComplete", !state.incomplete), Map.entry("providerResponses", providerResponses),
                Map.entry("providerResponsesWithTokenUsage", knownTokenUsage),
                Map.entry("providerDispatchesConfirmedByExistingBinding", confirmedDispatches),
                Map.entry("chargedUsageIncluded", false), Map.entry("cacheReuseIncludedInProviderUsage", false),
                Map.entry("usageNote", "Observed token usage is copied from returned provider responses; persisted usage ledger remains authoritative.")));
    }

    private void writeBudgeted(RunState state, String name, String value) throws IOException {
        byte[] data = value.getBytes(StandardCharsets.UTF_8);
        if (!reserveBytes(data.length, state, true)) { state.incomplete = true; return; }
        Files.write(state.directory.resolve(name), data, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        state.bytes += data.length;
    }

    private String renderReport(RunState state, OverviewTraceEvent terminal, long lost) {
        StringBuilder report = new StringBuilder("# Overview trace\n\n")
                .append("- formatVersion: 1\n- ownerId: `").append(terminal.ownerId())
                .append("`\n- runId: `").append(terminal.runId()).append("`\n- outcome: `")
                .append(terminal.outcome()).append("`\n- captureComplete: `")
                .append(!state.incomplete && lost == 0).append("`\n- droppedEvents: `").append(lost).append("`\n\n")
                .append("Usage fields come from returned provider responses; persisted usage ledger remains authoritative. Cache reuse is not counted as a provider call.\n\n")
                .append("| Time | Event | Step | Outcome |\n| --- | --- | --- | --- |\n");
        for (OverviewTraceEvent event : state.events) {
            report.append('|').append(event.at()).append('|').append(escapeCell(event.type())).append('|')
                    .append(escapeCell(event.step())).append('|').append(escapeCell(event.outcome())).append("|\n");
        }
        for (OverviewTraceEvent event : state.events) {
            for (Map.Entry<String, String> field : event.fields().entrySet()) {
                if (!field.getKey().startsWith("content.")) continue;
                report.append("\n## ").append(escapeCell(event.type())).append(" / ")
                        .append(escapeCell(field.getKey().substring("content.".length()))).append("\n\n");
                int fenceLength = Math.max(3, longestBacktickRun(field.getValue()) + 1);
                String fence = "`".repeat(fenceLength);
                report.append(fence).append("text\n").append(field.getValue()).append('\n').append(fence).append('\n');
            }
        }
        report.append("\nDetails are inert text. Open `events.ndjson` for metadata and machine-readable event rows.\n");
        return report.toString();
    }

    private static int longestBacktickRun(String value) {
        int best = 0, current = 0;
        for (int index = 0; index < value.length(); index++) {
            current = value.charAt(index) == '`' ? current + 1 : 0;
            best = Math.max(best, current);
        }
        return best;
    }

    private Path ownedDirectory(UUID owner, UUID run, boolean create) throws IOException {
        if (owner == null || run == null) throw new IOException("Missing trace identity");
        if (create) {
            Files.createDirectories(root);
            realRoot = root.toRealPath();
        }
        Path ownerDir = root.resolve(owner.toString());
        Path runDir = ownerDir.resolve(run.toString());
        rejectSymlink(ownerDir); rejectSymlink(runDir);
        if (create) {
            Files.createDirectories(runDir);
            Path real = runDir.toRealPath();
            if (!real.startsWith(realRoot)) throw new IOException("Trace path escaped configured root");
            Path markerPath = real.resolve(MARKER);
            if (!Files.exists(markerPath, LinkOption.NOFOLLOW_LINKS)) {
                Files.writeString(markerPath, "auralis-overview-trace-v1\n" + owner + "\n" + run + "\n",
                        StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
            }
        }
        Path real = runDir.toRealPath(LinkOption.NOFOLLOW_LINKS);
        if (realRoot != null && !real.startsWith(realRoot)) throw new IOException("Trace path escaped configured root");
        Path marker = real.resolve(MARKER);
        if (!Files.isRegularFile(marker, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Trace ownership marker missing");
        List<String> lines = Files.readAllLines(marker, StandardCharsets.UTF_8);
        if (lines.size() != 3 || !lines.get(0).equals("auralis-overview-trace-v1")
                || !lines.get(1).equals(owner.toString()) || !lines.get(2).equals(run.toString())) {
            throw new IOException("Trace ownership marker invalid");
        }
        return real;
    }

    private void rejectSymlink(Path path) throws IOException {
        if (Files.exists(path, LinkOption.NOFOLLOW_LINKS) && Files.isSymbolicLink(path)) {
            throw new IOException("Trace directory may not be a symbolic link");
        }
    }

    private void markOpenRunsIncomplete() {
        for (Map.Entry<UUID, RunState> entry : active.entrySet()) {
            try {
                RunState state = entry.getValue();
                state.incomplete = true;
                OverviewTraceEvent last = state.events.isEmpty() ? null : state.events.getLast();
                UUID owner = last == null ? null : last.ownerId();
                if (owner == null) continue;
                OverviewTraceEvent terminal = new OverviewTraceEvent(1, Instant.now(), "RUN_FINISHED", owner,
                        entry.getKey(), last.requestId(), last.generationId(), last.jobId(), null, null,
                        "OVERVIEW", null, "INCOMPLETE", Map.of());
                writeBudgeted(state, "summary.json", summary(terminal, state,
                        dropped.getOrDefault(entry.getKey(), new AtomicLong()).get()) + "\n");
                writeBudgeted(state, "report.md", renderIncompleteReport(entry.getKey()));
            } catch (Exception exception) {
                log.warn("Overview trace open run could not be marked incomplete");
            }
        }
    }

    private static String renderIncompleteReport(UUID runId) {
        return "# Overview trace\n\n- runId: `" + runId
                + "`\n- captureComplete: `false`\n\nCapture stopped before a terminal event.\n\n"
                + "Observed response token usage may be incomplete; the persisted usage ledger remains authoritative. "
                + "Cache reuse is not counted as a provider call.\n";
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); } catch (Exception exception) { throw new IllegalStateException(exception); }
    }
    private static UUID parseUuid(String value) { try { return value == null ? null : UUID.fromString(value); } catch (IllegalArgumentException exception) { return null; } }
    private static String escapeCell(String value) { return value == null ? "" : value.replace("|", "\\|").replace("\n", " ").replace("\r", " "); }
    private static void putBounded(Map<String, String> fields, String key, String value) {
        if (key == null || value == null) return;
        int length = utf8Length(value);
        fields.put(key, length <= MAX_FIELD_BYTES ? value : clipUtf8(value, MAX_FIELD_BYTES)
                + "\n[TRACE TRUNCATED; originalUtf8Bytes=" + length + "]");
        if (length > MAX_FIELD_BYTES) fields.put("truncated." + key, "originalUtf8Bytes=" + length);
    }
    private static int utf8Length(String value) {
        int bytes = 0;
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
            offset += Character.charCount(codePoint);
        }
        return bytes;
    }
    private static String clipUtf8(String value, int maximumBytes) {
        int end = 0, bytes = 0;
        while (end < value.length()) {
            int codePoint = value.codePointAt(end);
            int next = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
            if (bytes + next > maximumBytes) break;
            bytes += next;
            end += Character.charCount(codePoint);
        }
        return value.substring(0, end);
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        try { writer.join(2000); } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
        if (writer.isAlive()) {
            writer.interrupt();
            log.warn("Overview trace writer did not flush within two seconds; remaining runs will be incomplete");
        }
    }

    private static final class RunState {
        private final Path directory;
        private final List<OverviewTraceEvent> events = new ArrayList<>();
        private long bytes;
        private long reportedDrops;
        private boolean incomplete;
        private RunState(Path directory) { this.directory = directory; }
    }
}
