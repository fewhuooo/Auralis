package com.auralis.app;

import com.auralis.app.stats.internal.StatsQueryRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StatsQueryRepositoryTests {

    @Test
    void bindsEveryInstantArgumentAsJdbcTimestampWithoutChangingOtherArguments() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Number.class), any(Object[].class))).thenReturn(0L);
        StatsQueryRepository repository = new StatsQueryRepository(jdbcTemplate);
        UUID userId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        Instant at = Instant.parse("2026-09-05T00:00:00Z");
        Instant from = at.minusSeconds(3600);
        Instant to = at.plusSeconds(3600);

        repository.dueReviews(userId, at);
        repository.completedReviews(userId, at);
        repository.reviewed(userId, from, to);
        repository.studySeconds(userId, from, to);
        repository.completedTasks(otherUserId, from, to);
        repository.createdKnowledge(userId, from, to);

        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, org.mockito.Mockito.times(6))
                .queryForObject(anyString(), eq(Number.class), arguments.capture());
        List<Object[]> captured = arguments.getAllValues();
        assertThat(captured).hasSize(6);
        assertThat(captured.get(0)).containsExactly(userId, Timestamp.from(at), userId);
        assertThat(captured.get(1)).containsExactly(userId, Timestamp.from(at));
        assertThat(captured.get(2)).containsExactly(userId, Timestamp.from(from), Timestamp.from(to));
        assertThat(captured.get(3)).containsExactly(userId, Timestamp.from(from), Timestamp.from(to));
        assertThat(captured.get(4)).containsExactly(otherUserId, Timestamp.from(from), Timestamp.from(to));
        assertThat(captured.get(5)).containsExactly(userId, Timestamp.from(from), Timestamp.from(to));
    }
}
