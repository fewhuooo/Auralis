package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiIngestionJobTests {

    @Mock
    private IngestionJobRepository jobRepository;

    @InjectMocks
    private IngestionJobService jobService;

    @Test
    void enqueueIsIdempotentForTheSameOwnedSource() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        IngestionJobEntity existing = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING);
        when(jobRepository.findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(userId, sourceId))
                .thenReturn(Optional.of(existing));

        IngestionJobEntity result = jobService.enqueue(userId, sourceId);

        assertThat(result).isSameAs(existing);
        verify(jobRepository, never()).save(any());
    }
}
