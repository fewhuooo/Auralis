package com.auralis.app.ai.usage;

import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

@Configuration
public class AiUsageHeartbeatConfiguration {

    @Bean(name = "aiUsageHeartbeatExecutor", destroyMethod = "shutdownNow")
    public ScheduledExecutorService aiUsageHeartbeatExecutor(AuralisProperties properties) {
        int threads = Math.max(1, Math.min(8, properties.ai().limits().globalConcurrent()));
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = runnable -> {
            Thread thread = new Thread(runnable, "ai-usage-heartbeat-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(threads, factory);
        executor.setRemoveOnCancelPolicy(true);
        executor.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        executor.setContinueExistingPeriodicTasksAfterShutdownPolicy(false);
        return executor;
    }
}
