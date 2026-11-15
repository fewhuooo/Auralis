package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewGenerationService;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ActiveProfiles;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = AuralisApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "auralis.ai.overview-task-timeout-millis=2000")
@Import(OverviewSseDeadlineSocketIntegrationTests.OverviewTestConfiguration.class)
@ActiveProfiles("test")
class OverviewSseDeadlineSocketIntegrationTests {

    @LocalServerPort
    private int port;

    @Autowired private IdentityService identityService;
    @Autowired private OverviewGenerationService generationService;
    @Autowired @Qualifier("mvcAsyncTaskExecutor") private ThreadPoolTaskExecutor requestExecutor;

    @Test
    void deadlineSendsTerminalTimeoutEventAndUnwindsWorker() throws Exception {
        clearInvocations(generationService);
        var auth = register("sse-deadline");
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch workerExited = new CountDownLatch(1);
        AtomicInteger cancelled = new AtomicInteger();
        doAnswer(invocation -> {
            OverviewCancellation cancellation = invocation.getArgument(3);
            entered.countDown();
            cancellation.onCancel(cancelled::incrementAndGet);
            try {
                while (!cancellation.isCancelled()) Thread.sleep(10);
                return response();
            } finally {
                workerExited.countDown();
            }
        }).when(generationService).generateSource(any(UUID.class), any(OverviewDtos.SourceOverviewRequest.class),
                any(), any(OverviewCancellation.class), any());

        HttpURLConnection connection = request(auth.tokens().accessToken());
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                connection.getInputStream(), StandardCharsets.UTF_8))) {
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            String errorData = readTerminalError(reader, 4);
            assertThat(errorData).contains("MODEL_TIMEOUT", "504");
        } finally {
            connection.disconnect();
        }
        assertThat(workerExited.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(cancelled).hasValue(1);
    }

    @Test
    void requestQueueTimeCountsAndExpiredQueuedWorkNeverStartsOverview() throws Exception {
        clearInvocations(generationService);
        var auth = register("sse-queue-deadline");
        CountDownLatch workersStarted = new CountDownLatch(8);
        CountDownLatch freeOneWorker = new CountDownLatch(1);
        CountDownLatch releaseRemaining = new CountDownLatch(1);
        AtomicInteger submitted = new AtomicInteger();
        for (int i = 0; i < 24; i++) {
            int task = submitted.getAndIncrement();
            requestExecutor.execute(() -> {
                workersStarted.countDown();
                try {
                    if (task == 0) freeOneWorker.await();
                    else releaseRemaining.await();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        HttpURLConnection connection = null;
        try {
            assertThat(workersStarted.await(3, TimeUnit.SECONDS)).isTrue();
            long fullQueueDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (requestExecutor.getThreadPoolExecutor().getQueue().size() != 16
                    && System.nanoTime() < fullQueueDeadline) Thread.sleep(5);
            assertThat(requestExecutor.getThreadPoolExecutor().getQueue().size()).isEqualTo(16);
            freeOneWorker.countDown();
            long queueSlotDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (requestExecutor.getThreadPoolExecutor().getQueue().size() != 15
                    && System.nanoTime() < queueSlotDeadline) Thread.sleep(5);
            assertThat(requestExecutor.getThreadPoolExecutor().getQueue().size()).isEqualTo(15);

            connection = request(auth.tokens().accessToken());
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    connection.getInputStream(), StandardCharsets.UTF_8))) {
                assertThat(readTerminalError(reader, 4)).contains("MODEL_TIMEOUT", "504");
                String trailing = reader.readLine();
                while (trailing != null && trailing.isEmpty()) trailing = reader.readLine();
                assertThat(trailing).isNull();
            }
            // The MVC workers and queue remain blocked through the deadline terminal event.
            assertThat(requestExecutor.getThreadPoolExecutor().getQueue().size()).isEqualTo(16);
            releaseRemaining.countDown();
            long drainDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while ((requestExecutor.getThreadPoolExecutor().getQueue().size() != 0
                    || requestExecutor.getThreadPoolExecutor().getActiveCount() != 0)
                    && System.nanoTime() < drainDeadline) Thread.sleep(5);
            assertThat(requestExecutor.getThreadPoolExecutor().getQueue()).isEmpty();
            assertThat(requestExecutor.getThreadPoolExecutor().getActiveCount()).isZero();
            verify(generationService, never()).generateSource(any(UUID.class),
                    any(OverviewDtos.SourceOverviewRequest.class), any(), any(OverviewCancellation.class), any());
        } finally {
            freeOneWorker.countDown();
            releaseRemaining.countDown();
            if (connection != null) connection.disconnect();
        }
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

    private HttpURLConnection request(String bearer) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) URI.create("http://127.0.0.1:" + port
                + "/api/ai/source-overviews").toURL().openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(3_000);
        connection.setReadTimeout(6_000);
        connection.setDoOutput(true);
        connection.setRequestProperty(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        connection.setRequestProperty(HttpHeaders.ACCEPT, "text/event-stream");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.getOutputStream().write(("{\"sourceId\":\"" + UUID.randomUUID()
                + "\",\"mode\":\"ALL\"}").getBytes(StandardCharsets.UTF_8));
        assertThat(connection.getResponseCode()).isEqualTo(200);
        return connection;
    }

    private AuthResult register(String label) {
        return AuthTestAccounts.register(identityService, "os-" + UUID.randomUUID() + "@e.co",
                "correct horse battery staple",
                new DeviceCommand("os-device-" + UUID.randomUUID(), "Test", DevicePlatform.WEB));
    }

    private OverviewDtos.OverviewResponse response() {
        return new OverviewDtos.OverviewResponse(2, "A test overview", "## Test outline", "Summary");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class OverviewTestConfiguration {
        @Bean @Primary
        OverviewGenerationService fakeOverviewGenerationService() {
            return mock(OverviewGenerationService.class);
        }
    }
}
