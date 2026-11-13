package com.auralis.app;

import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewGenerationService;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewSseAdapter;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.identity.AuthResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = AuralisApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "auralis.ai.overview-task-timeout-millis=5000")
@Import(OverviewSseSocketIntegrationTests.OverviewTestConfiguration.class)
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OverviewSseSocketIntegrationTests {

    private static volatile CountDownLatch generationRejectionGate = new CountDownLatch(0);
    private static final AtomicBoolean rejectSubjectGeneration = new AtomicBoolean(true);
    private static volatile WriterExecutionGate writerExecutionGate;

    @LocalServerPort
    private int port;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private OverviewGenerationService generationService;

    @Autowired
    @Qualifier("overviewSseWriterExecutor")
    private ThreadPoolExecutor writerExecutor;

    @Autowired
    @Qualifier("mvcAsyncTaskExecutor")
    private ThreadPoolTaskExecutor mvcAsyncTaskExecutor;

    @Autowired
    private OverviewSseAdapter sseAdapter;


    @Test
    void actualTcpDisconnectCancelsRequestAndLetsOverviewWorkerExit() throws Exception {
        var auth = register("sse-cancel");
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch cancelled = new CountDownLatch(1);
        CountDownLatch workerExited = new CountDownLatch(1);
        AtomicReference<OverviewCancellation> tokenRef = new AtomicReference<>();
        OverviewDtos.OverviewResponse response = response();
        doAnswer(invocation -> {
            OverviewCancellation cancellation = invocation.getArgument(3);
            tokenRef.set(cancellation);
            entered.countDown();
            cancellation.onCancel(cancelled::countDown);
            try {
                cancelled.await(5, TimeUnit.SECONDS);
                return response;
            } finally {
                workerExited.countDown();
            }
        }).when(generationService).generateSource(any(UUID.class), any(OverviewDtos.SourceOverviewRequest.class),
                any(), any(OverviewCancellation.class), any());

        HttpURLConnection connection = request(auth.tokens().accessToken(), "text/event-stream");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                connection.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean heartbeat = false;
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < end && (line = reader.readLine()) != null) {
                if (line.startsWith(":")) { heartbeat = true; break; }
            }
            assertThat(heartbeat).isTrue();
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            connection.disconnect();
        }

        assertThat(cancelled.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(workerExited.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(tokenRef.get().reason()).isEqualTo(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
    }

    @Test
    void defaultJsonAcceptStillReturnsOverviewResponse() throws Exception {
        var auth = register("sse-json");
        when(generationService.generateSource(any(UUID.class), any(OverviewDtos.SourceOverviewRequest.class),
                any(), any(), any()))
                .thenReturn(response());
        HttpURLConnection connection = request(auth.tokens().accessToken(), "application/json");
        try (var input = connection.getInputStream()) {
            String body = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(connection.getContentType()).startsWith("application/json");
            assertThat(body).contains("\"schemaVersion\":2", "\"title\":\"A test overview\"",
                    "\"outlineMarkdown\":\"## Test outline\"", "\"summaryMarkdown\":\"Summary\"");
        } finally {
            connection.disconnect();
        }
    }

    @Test
    void subjectRegenerationAcceptingEventStreamReturnsOverviewJsonResult() throws Exception {
        var auth = register("sse-subject-result");
        when(generationService.generateSubject(any(UUID.class), any(OverviewDtos.SubjectOverviewRequest.class),
                any(), any(), any()))
                .thenReturn(new OverviewDtos.OverviewResponse(2, "A test overview", null, "Summary"));

        rejectSubjectGeneration.set(false);
        try {
            HttpURLConnection connection = request(auth.tokens().accessToken(), "text/event-stream", true);
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    connection.getInputStream(), StandardCharsets.UTF_8))) {
                assertThat(connection.getContentType()).startsWith("text/event-stream");
                String event = readTerminalResult(reader, 3);
                assertThat(event).contains("event:result", "data:", "\"schemaVersion\":2", "\"title\":\"A test overview\"",
                        "\"outlineMarkdown\":null", "\"summaryMarkdown\":\"Summary\"");
            } finally {
                connection.disconnect();
            }
        } finally {
            rejectSubjectGeneration.set(true);
        }
    }

    @Test
    void subjectUsageLimitKeepsSafeCodeAndRetryMetadataInSseTerminalEvent() throws Exception {
        var auth = register("sse-subject-usage-limit");
        doAnswer(invocation -> {
            Thread.sleep(1_000);
            throw new AiUsageLimitException("AI_DAILY_QUOTA_EXCEEDED", 429, 42,
                    Instant.parse("2026-10-11T00:00:00Z"));
        }).when(generationService).generateSubject(any(UUID.class),
                any(OverviewDtos.SubjectOverviewRequest.class), any(), any(), any());

        rejectSubjectGeneration.set(false);
        try {
            HttpURLConnection connection = request(auth.tokens().accessToken(), "text/event-stream", true);
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    connection.getInputStream(), StandardCharsets.UTF_8))) {
                String data = readTerminalError(reader, 3);
                assertThat(data).contains("AI_DAILY_QUOTA_EXCEEDED", "429", "\"retryAfterSeconds\":42",
                        "2026-10-11T00:00:00Z");
            } finally {
                connection.disconnect();
            }
        } finally {
            rejectSubjectGeneration.set(true);
        }
    }

    @Test
    void sourceTaskBudgetLimitIsReturnedByTheDirectSseEndpoint() throws Exception {
        var auth = register("sse-overview-task-budget-limit");
        doAnswer(invocation -> {
            Thread.sleep(1_000);
            throw new AiUsageLimitException("AI_TASK_BUDGET_EXCEEDED", 422, 0, null);
        }).when(generationService).generateSource(any(UUID.class),
                any(OverviewDtos.SourceOverviewRequest.class), any(), any(), any());

        HttpURLConnection connection = request(auth.tokens().accessToken(), "text/event-stream");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                connection.getInputStream(), StandardCharsets.UTF_8))) {
            String data = readTerminalError(reader, 3);
            assertThat(connection.getContentType()).startsWith("text/event-stream");
            assertThat(data).contains("AI_TASK_BUDGET_EXCEEDED", "422")
                    .doesNotContain("retryAfterSeconds", "resetAt");
        } finally {
            connection.disconnect();
        }
    }

    @Test
    void sourceGenerationRejectionAfterHeartbeatEmitsSafeServiceUnavailable() throws Exception {
        var auth = register("sse-source-overload");
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch reject = new CountDownLatch(1);
        doAnswer(invocation -> {
            entered.countDown();
            assertThat(reject.await(3, TimeUnit.SECONDS)).isTrue();
            throw new DomainException("SERVICE_UNAVAILABLE", "sensitive executor detail");
        }).when(generationService).generateSource(any(UUID.class), any(OverviewDtos.SourceOverviewRequest.class),
                any(), any(), any());

        HttpURLConnection connection = request(auth.tokens().accessToken(), "text/event-stream", false);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                connection.getInputStream(), StandardCharsets.UTF_8))) {
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(readHeartbeat(reader)).isTrue();
            reject.countDown();
            String data = readTerminalError(reader, 3);
            assertThat(data).contains("SERVICE_UNAVAILABLE", "503", "Service is busy", "\"retryAfterSeconds\":1");
            assertThat(data).doesNotContain("sensitive executor detail");
        } finally {
            reject.countDown();
            connection.disconnect();
        }
    }

    @Test
    void subjectGenerationPoolRejectionAfterHeartbeatEmitsSafeServiceUnavailable() throws Exception {
        var auth = register("sse-subject-overload");
        generationRejectionGate = new CountDownLatch(1);
        HttpURLConnection connection = request(auth.tokens().accessToken(), "text/event-stream", true);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                connection.getInputStream(), StandardCharsets.UTF_8))) {
            assertThat(readHeartbeat(reader)).isTrue();
            generationRejectionGate.countDown();
            String data = readTerminalError(reader, 3);
            assertThat(data).contains("SERVICE_UNAVAILABLE", "503", "Service is busy", "\"retryAfterSeconds\":1");
            assertThat(data).doesNotContain("sensitive executor detail");
        } finally {
            generationRejectionGate.countDown();
            connection.disconnect();
        }
    }

    @Test
    void queuedDeadlineWritersKeepAllEightSsePermitsOccupied() throws Exception {
        WriterExecutionGate gate = new WriterExecutionGate();
        writerExecutionGate = gate;
        CountDownLatch generationsEntered = new CountDownLatch(4);
        CountDownLatch cancellationsObserved = new CountDownLatch(4);
        CountDownLatch releaseGenerationWorkers = new CountDownLatch(1);
        CountDownLatch generationWorkersExited = new CountDownLatch(4);
        int activeMvcWorkersBefore = mvcAsyncTaskExecutor.getActiveCount();
        doAnswer(invocation -> {
            OverviewCancellation cancellation = invocation.getArgument(3);
            generationsEntered.countDown();
            CountDownLatch cancelled = new CountDownLatch(1);
            cancellation.onCancel(cancelled::countDown);
            try {
                assertThat(cancelled.await(20, TimeUnit.SECONDS)).isTrue();
                cancellationsObserved.countDown();
                assertThat(releaseGenerationWorkers.await(5, TimeUnit.SECONDS)).isTrue();
                throw new DomainException("MODEL_TIMEOUT", "test timeout");
            } finally {
                generationWorkersExited.countDown();
            }
        }).when(generationService).generateSource(any(UUID.class), any(OverviewDtos.SourceOverviewRequest.class),
                any(), any(OverviewCancellation.class), any());

        try {
            OverviewDtos.SourceOverviewRequest request = new OverviewDtos.SourceOverviewRequest(
                    UUID.randomUUID(), OverviewMode.ALL, null);
            for (int index = 0; index < 8; index++) {
                sseAdapter.source(UUID.randomUUID(), request, "writer-permit-test-" + index);
            }
            assertThat(generationsEntered.await(6, TimeUnit.SECONDS)).isTrue();
            assertThat(gate.firstWaveStarted.await(6, TimeUnit.SECONDS)).isTrue();
            assertThat(writerExecutor.getActiveCount()).isEqualTo(8);
            assertThat(cancellationsObserved.await(8, TimeUnit.SECONDS)).isTrue();
            long queuedDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (writerExecutor.getQueue().size() != 8 && System.nanoTime() < queuedDeadline) {
                Thread.sleep(10);
            }
            assertThat(writerExecutor.getQueue()).hasSize(8);

            gate.releaseFirstWave.countDown();
            assertThat(gate.terminalWaveStarted.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(availableSsePermits()).isZero();
            releaseGenerationWorkers.countDown();
            assertThat(generationWorkersExited.await(3, TimeUnit.SECONDS)).isTrue();
            long mvcExitDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (mvcAsyncTaskExecutor.getActiveCount() > activeMvcWorkersBefore
                    && System.nanoTime() < mvcExitDeadline) Thread.sleep(10);
            assertThat(mvcAsyncTaskExecutor.getActiveCount()).isEqualTo(activeMvcWorkersBefore);
            assertThat(availableSsePermits())
                    .as("terminal writer work still owns the eight stream permits")
                    .isZero();

            assertThatThrownBy(() -> sseAdapter.source(UUID.randomUUID(), request, "writer-permit-test-ninth"))
                    .as("the terminal writer tasks are still held before execution")
                    .isInstanceOf(TaskRejectedException.class);
        } finally {
            gate.releaseFirstWave.countDown();
            gate.releaseTerminalWave.countDown();
            releaseGenerationWorkers.countDown();
            writerExecutionGate = null;
        }
    }

    @Test
    @Order(1)
    void rejectedHeartbeatWriterBalancesPendingCountAndReleasesPermits() throws Exception {
        CountDownLatch activeWriterTasks = new CountDownLatch(8);
        CountDownLatch releaseWriterTasks = new CountDownLatch(1);
        CountDownLatch cancellationObserved = new CountDownLatch(1);
        CountDownLatch requestWorkerExited = new CountDownLatch(1);
        long idleDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while ((writerExecutor.getActiveCount() != 0 || !writerExecutor.getQueue().isEmpty()
                || availableSsePermits() != 8)
                && System.nanoTime() < idleDeadline) Thread.sleep(10);
        assertThat(writerExecutor.getActiveCount()).isZero();
        assertThat(writerExecutor.getQueue()).isEmpty();
        assertThat(availableSsePermits()).isEqualTo(8);
        try {
        for (int index = 0; index < 16; index++) {
            writerExecutor.execute(() -> {
                activeWriterTasks.countDown();
                awaitGate(releaseWriterTasks);
            });
        }
        assertThat(activeWriterTasks.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(writerExecutor.getQueue()).hasSize(8);

        doAnswer(invocation -> {
            OverviewCancellation cancellation = invocation.getArgument(3);
            cancellation.onCancel(cancellationObserved::countDown);
            try {
                assertThat(cancellationObserved.await(4, TimeUnit.SECONDS)).isTrue();
                throw new DomainException("MODEL_TIMEOUT", "writer rejected");
            } finally {
                requestWorkerExited.countDown();
            }
        }).when(generationService).generateSource(any(UUID.class), any(OverviewDtos.SourceOverviewRequest.class),
                any(), any(OverviewCancellation.class), any());

            sseAdapter.source(UUID.randomUUID(),
                    new OverviewDtos.SourceOverviewRequest(UUID.randomUUID(), OverviewMode.ALL, null),
                    "writer-rejection-test");
            assertThat(requestWorkerExited.await(4, TimeUnit.SECONDS)).isTrue();
            long releaseDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (availableSsePermits() != 8 && System.nanoTime() < releaseDeadline) Thread.sleep(10);
            assertThat(availableSsePermits()).isEqualTo(8);
        } finally {
            releaseWriterTasks.countDown();
        }
    }

    private HttpURLConnection request(String bearer, String accept) throws Exception {
        return request(bearer, accept, false);
    }

    private HttpURLConnection request(String bearer, String accept, boolean subject) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) URI.create("http://127.0.0.1:" + port
                + (subject ? "/api/ai/subject-overviews" : "/api/ai/source-overviews")).toURL().openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(3_000);
        connection.setReadTimeout(6_000);
        connection.setDoOutput(true);
        connection.setRequestProperty(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        connection.setRequestProperty(HttpHeaders.ACCEPT, accept);
        connection.setRequestProperty("Content-Type", "application/json");
        String requestBody = subject
                ? "{\"subjectId\":\"" + UUID.randomUUID() + "\",\"mode\":\"SUMMARY\",\"sources\":[{\"sourceId\":\""
                    + UUID.randomUUID() + "\",\"title\":\"Test source\",\"summaryMarkdown\":\"Source summary\"}]}"
                : "{\"sourceId\":\"" + UUID.randomUUID() + "\",\"mode\":\"ALL\"}";
        connection.getOutputStream().write(requestBody.getBytes(StandardCharsets.UTF_8));
        assertThat(connection.getResponseCode()).isEqualTo(200);
        return connection;
    }

    private boolean readHeartbeat(BufferedReader reader) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        String line;
        while (System.nanoTime() < end && (line = reader.readLine()) != null) {
            if (line.startsWith(":")) return true;
        }
        return false;
    }

    private String readTerminalError(BufferedReader reader, int timeoutSeconds) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        String line;
        while (System.nanoTime() < end && (line = reader.readLine()) != null) {
            if (line.startsWith("event:error") || line.startsWith("event: error")) {
                String data = reader.readLine();
                return data != null && data.startsWith("data:") ? data : null;
            }
        }
        return null;
    }

    private String readTerminalResult(BufferedReader reader, int timeoutSeconds) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        StringBuilder event = new StringBuilder();
        String line;
        while (System.nanoTime() < end && (line = reader.readLine()) != null) {
            if (line.isEmpty()) {
                if (event.toString().startsWith("event:result")) return event.toString();
                event.setLength(0);
                continue;
            }
            event.append(line).append('\n');
        }
        return null;
    }

    private int availableSsePermits() throws Exception {
        var field = OverviewSseAdapter.class.getDeclaredField("ssePermits");
        field.setAccessible(true);
        return ((java.util.concurrent.Semaphore) field.get(sseAdapter)).availablePermits();
    }

    private AuthResult register(String label) {
        return identityService.register("os-" + UUID.randomUUID() + "@e.co",
                "correct horse battery staple", label,
                new DeviceCommand("os-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
    }

    private OverviewDtos.OverviewResponse response() {
        return new OverviewDtos.OverviewResponse(2, "A test overview", "## Test outline", "Summary");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class OverviewTestConfiguration {
        @Bean
        @Primary
        @org.springframework.beans.factory.annotation.Qualifier("overviewSseWriterExecutor")
        ThreadPoolExecutor controlledOverviewSseWriterExecutor() {
            AtomicInteger sequence = new AtomicInteger();
            ThreadFactory factory = task -> {
                Thread thread = new Thread(task, "overview-sse-writer-test-" + sequence.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            };
            return new ThreadPoolExecutor(8, 8, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(8), factory,
                    new ThreadPoolExecutor.AbortPolicy()) {
                @Override
                protected void beforeExecute(Thread thread, Runnable task) {
                    WriterExecutionGate gate = writerExecutionGate;
                    if (gate != null) {
                        int taskIndex = gate.startedTasks.getAndIncrement();
                        if (taskIndex < 8) {
                            gate.firstWaveStarted.countDown();
                            awaitGate(gate.releaseFirstWave);
                        } else {
                            gate.terminalWaveStarted.countDown();
                            awaitGate(gate.releaseTerminalWave);
                        }
                    }
                    super.beforeExecute(thread, task);
                }
            };
        }

        @Bean
        @Primary
        @org.springframework.beans.factory.annotation.Qualifier("overviewGenerationExecutor")
        Executor rejectingOverviewGenerationExecutor() {
            return command -> {
                if (!rejectSubjectGeneration.get()) {
                    command.run();
                    return;
                }
                try {
                    if (!generationRejectionGate.await(3, TimeUnit.SECONDS)) {
                        throw new TaskRejectedException("test rejection gate timed out");
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new TaskRejectedException("test rejection gate interrupted", interrupted);
                }
                throw new TaskRejectedException("sensitive executor detail");
            };
        }

        @Bean
        @Primary
        OverviewGenerationService fakeOverviewGenerationService() {
            return mock(OverviewGenerationService.class);
        }
    }

    private static void awaitGate(CountDownLatch gate) {
        try {
            gate.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static final class WriterExecutionGate {
        private final AtomicInteger startedTasks = new AtomicInteger();
        private final CountDownLatch firstWaveStarted = new CountDownLatch(8);
        private final CountDownLatch terminalWaveStarted = new CountDownLatch(8);
        private final CountDownLatch releaseFirstWave = new CountDownLatch(1);
        private final CountDownLatch releaseTerminalWave = new CountDownLatch(1);
    }
}
