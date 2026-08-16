package com.auralis.app;

import com.auralis.app.ai.ingestion.IngestionWorker;
import com.auralis.app.ai.ingestion.IngestionWorkerScheduler;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AiIngestionSchedulerTests {

    @Test
    void pollDelegatesToWorker() {
        IngestionWorker worker = mock(IngestionWorker.class);

        new IngestionWorkerScheduler(worker).poll();

        verify(worker).processNext();
    }
}
