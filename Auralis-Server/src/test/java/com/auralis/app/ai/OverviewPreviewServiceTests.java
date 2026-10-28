package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class OverviewPreviewServiceTests {
    @Test
    void previewPageRejectsUnboundedLimitsBeforeLoadingJobOrCheckpointData() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        OverviewJobRepository jobs = mock(OverviewJobRepository.class);
        OverviewPublicationRepository publications = mock(OverviewPublicationRepository.class);
        OverviewGenerationService generation = mock(OverviewGenerationService.class);
        OverviewIdentityService identities = mock(OverviewIdentityService.class);
        OverviewDocumentValidator validator = mock(OverviewDocumentValidator.class);
        OverviewPreviewService service = new OverviewPreviewService(jdbc, jobs, publications, generation,
                identities, validator, new ObjectMapper());

        assertThatThrownBy(() -> service.page(UUID.randomUUID(), UUID.randomUUID(), 51, null))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("between 1 and 50");

        verifyNoInteractions(jdbc, jobs, publications, generation, identities, validator);
    }
}
