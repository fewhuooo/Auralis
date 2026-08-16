package com.auralis.app.ai.ingestion;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        prefix = "auralis.ai",
        name = "ingestion-worker-enabled",
        havingValue = "true")
public class IngestionWorkerScheduler {

    private final IngestionWorker worker;

    public IngestionWorkerScheduler(IngestionWorker worker) {
        this.worker = worker;
    }

    @Scheduled(fixedDelayString = "${auralis.ai.ingestion-poll-delay-millis:1000}")
    public void poll() {
        worker.processNext();
    }
}
