package com.auralis.app.shared.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Qualifier;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

import java.util.Arrays;

@Configuration(proxyBeanMethods = false)
public class WebConfiguration implements WebMvcConfigurer {

    private final AuralisProperties properties;
    private final AsyncTaskExecutor mvcAsyncTaskExecutor;

    public WebConfiguration(AuralisProperties properties,
            @Qualifier("mvcAsyncTaskExecutor") AsyncTaskExecutor mvcAsyncTaskExecutor) {
        this.properties = properties;
        this.mvcAsyncTaskExecutor = mvcAsyncTaskExecutor;
    }

    @Bean("mvcAsyncTaskExecutor")
    public static ThreadPoolTaskExecutor mvcAsyncTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(16);
        executor.setThreadNamePrefix("mvc-async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        return executor;
    }

    @Bean("overviewGenerationExecutor")
    public static ThreadPoolTaskExecutor overviewGenerationExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(16);
        executor.setThreadNamePrefix("overview-generation-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        return executor;
    }

    @Bean(name = "overviewDeadlineScheduler", destroyMethod = "shutdownNow")
    public static ScheduledExecutorService overviewDeadlineScheduler() {
        return removableScheduledExecutor("overview-deadline-watchdog");
    }

    @Bean(name = "overviewHeartbeatScheduler", destroyMethod = "shutdownNow")
    public static ScheduledExecutorService overviewHeartbeatScheduler() {
        return removableScheduledExecutor("overview-heartbeat-timer");
    }

    private static ScheduledThreadPoolExecutor removableScheduledExecutor(String threadName) {
        ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1, task -> {
            Thread thread = new Thread(task, threadName);
            thread.setDaemon(true);
            return thread;
        });
        executor.setRemoveOnCancelPolicy(true);
        return executor;
    }

    @Bean(name = "overviewSseWriterExecutor", destroyMethod = "shutdownNow")
    public static ThreadPoolExecutor overviewSseWriterExecutor() {
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = task -> {
            Thread thread = new Thread(task, "overview-sse-writer-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        return new ThreadPoolExecutor(8, 8, 0L, java.util.concurrent.TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(8), factory, new ThreadPoolExecutor.AbortPolicy());
    }

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setTaskExecutor(mvcAsyncTaskExecutor);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(Arrays.stream(properties.api().allowedOrigins().split(","))
                        .map(String::trim)
                        .filter(origin -> !origin.isBlank())
                        .toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type", "X-Trace-Id", "X-Realtime-Ticket", "X-Overview-Request-Id")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
