package com.auralis.server.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executors;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class ThreadPoolConfig {

    /**
     * Virtual Thread-backed Executor for I/O bound LLM calls & WebSocket notifications.
     */
    @Bean(name = "llmExecutor")
    public AsyncTaskExecutor llmExecutor() {
        return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    }

    /**
     * Bounded Thread Pool Executor for CPU-intensive document processing (Tika + Splitting).
     * Bounding prevents OOM and CPU starvation under heavy concurrent uploads.
     */
    @Bean(name = "cpuParserExecutor")
    public ThreadPoolTaskExecutor cpuParserExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        // Bounded core and max pools
        executor.setCorePoolSize(Runtime.getRuntime().availableProcessors());
        executor.setMaxPoolSize(Runtime.getRuntime().availableProcessors() * 2);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("cpu-parser-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
