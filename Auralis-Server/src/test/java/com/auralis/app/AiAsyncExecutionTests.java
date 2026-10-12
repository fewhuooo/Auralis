package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ThreadPoolExecutor;
import java.io.IOException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(AiAsyncExecutionTests.TestMvcConfiguration.class)
class AiAsyncExecutionTests {

    @Autowired
    private ThreadPoolTaskExecutor mvcAsyncTaskExecutor;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestMvcEndpoints testMvcEndpoints;

    @Test
    void synchronousApiRemainsResponsiveWhileMvcStreamingBodyWaits() throws Exception {
        testMvcEndpoints.reset();
        MvcResult stream = mockMvc.perform(get("/test/ai-block"))
                .andExpect(request().asyncStarted())
                .andReturn();

        assertThat(testMvcEndpoints.entered.await(5, TimeUnit.SECONDS)).isTrue();
        mockMvc.perform(get("/test/ping"))
                .andExpect(status().isOk())
                .andExpect(content().string("ok"));

        testMvcEndpoints.release.countDown();
        mockMvc.perform(asyncDispatch(stream))
                .andExpect(status().isOk())
                .andExpect(content().string("ready"));
        assertThat(testMvcEndpoints.finished.await(5, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    void mvcAsyncExecutorIsBoundedAndRejectsBeyondItsQueueAndPool() throws Exception {
        var executor = mvcAsyncTaskExecutor.getThreadPoolExecutor();
        assertThat(executor.getCorePoolSize()).isEqualTo(4);
        assertThat(executor.getMaximumPoolSize()).isEqualTo(8);
        assertThat(executor.getQueue().remainingCapacity()).isEqualTo(16);
        assertThat(executor.getRejectedExecutionHandler()).isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);

        CountDownLatch started = new CountDownLatch(8);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(24);
        try {
            for (int index = 0; index < 24; index++) {
                mvcAsyncTaskExecutor.execute(() -> {
                    started.countDown();
                    try {
                        release.await();
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                    } finally {
                        completed.countDown();
                    }
                });
            }

            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> mvcAsyncTaskExecutor.execute(() -> { }))
                    .isInstanceOf(TaskRejectedException.class);
        } finally {
            release.countDown();
        }

        assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    void mvcAsyncSaturationReturnsSafe503ProblemDetails() throws Exception {
        awaitExecutorIdle();
        CountDownLatch started = new CountDownLatch(8);
        CountDownLatch release = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger accepted = new java.util.concurrent.atomic.AtomicInteger();
        boolean rejected = false;
        try {
            for (int index = 0; index < 40; index++) {
                try {
                    mvcAsyncTaskExecutor.execute(() -> {
                        started.countDown();
                        try {
                            release.await();
                        } catch (InterruptedException exception) {
                            Thread.currentThread().interrupt();
                        }
                    });
                    accepted.incrementAndGet();
                } catch (TaskRejectedException expected) {
                    rejected = true;
                    break;
                }
            }
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(rejected).isTrue();
            assertThat(accepted.get()).isGreaterThan(0);

            mockMvc.perform(get("/test/reject"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(header().string("Retry-After", "1"))
                    .andExpect(jsonPath("$.code").value("SERVICE_UNAVAILABLE"))
                    .andExpect(jsonPath("$.retryAfterSeconds").value(1))
                    .andExpect(jsonPath("$.detail").value("Service is busy; retry shortly"));
        } finally {
            release.countDown();
        }
        awaitExecutorIdle();
    }

    private void awaitExecutorIdle() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        var executor = mvcAsyncTaskExecutor.getThreadPoolExecutor();
        while (System.nanoTime() < deadline
                && (executor.getActiveCount() != 0 || !executor.getQueue().isEmpty())) {
            Thread.sleep(10);
        }
        assertThat(executor.getActiveCount()).isZero();
        assertThat(executor.getQueue()).isEmpty();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestMvcConfiguration {
        @Bean
        TestMvcEndpoints testMvcEndpoints() {
            return new TestMvcEndpoints();
        }
    }

    @RestController
    static class TestMvcEndpoints {
        private volatile CountDownLatch entered = new CountDownLatch(0);
        private volatile CountDownLatch release = new CountDownLatch(0);
        private volatile CountDownLatch finished = new CountDownLatch(0);

        void reset() {
            entered = new CountDownLatch(1);
            release = new CountDownLatch(1);
            finished = new CountDownLatch(1);
        }

        @GetMapping(value = "/test/ai-block", produces = MediaType.TEXT_PLAIN_VALUE)
        StreamingResponseBody aiBlock() {
            return output -> {
                entered.countDown();
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) {
                        throw new IOException("test stream timed out");
                    }
                    output.write("ready".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("test stream interrupted", exception);
                } finally {
                    finished.countDown();
                }
            };
        }

        @GetMapping("/test/ping")
        String ping() {
            return "ok";
        }

        @GetMapping("/test/reject")
        void reject() {
            throw new TaskRejectedException("sensitive executor request state");
        }
    }
}
