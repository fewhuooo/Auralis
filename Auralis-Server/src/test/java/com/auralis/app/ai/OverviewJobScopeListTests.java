package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OverviewJobScopeListTests {
    @Test
    void scopeFilterRequiresPairAndForwardsTheExactDomain() {
        OverviewJobRepository repository = mock(OverviewJobRepository.class);
        OverviewJobService service = new OverviewJobService(repository, mock(OverviewGenerationService.class),
                mock(OverviewJobInvocationJournal.class), mock(ObjectMapper.class), Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        UUID scopeId = UUID.randomUUID();

        assertThatThrownBy(() -> service.list(userId, 20, null, OverviewJobDtos.Scope.SUBJECT, null))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("supplied together");
        verifyNoInteractions(repository);

        when(repository.list(eq(userId), eq(20), eq(null), eq(OverviewJobDtos.Scope.SUBJECT), eq(scopeId), any()))
                .thenReturn(new OverviewJobDtos.JobList(java.util.List.of(), null));
        service.list(userId, 20, null, OverviewJobDtos.Scope.SUBJECT, scopeId);
        verify(repository).list(eq(userId), eq(20), eq(null), eq(OverviewJobDtos.Scope.SUBJECT), eq(scopeId), any());
    }
}
