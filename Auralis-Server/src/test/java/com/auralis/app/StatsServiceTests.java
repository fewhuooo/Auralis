package com.auralis.app;

import com.auralis.app.stats.StatsService;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class StatsServiceTests {

    @Autowired
    private StatsService statsService;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private TaskService taskService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void overviewAndWeeklyQueriesAreOwnerScopedAndUseRequestedBoundaries() {
        UUID userId = UUID.randomUUID();
        var overview = statsService.overview(userId, Instant.parse("2026-08-13T00:00:00Z"));
        assertThat(overview.activeKnowledgeBlocks()).isZero();
        assertThat(overview.activeTasks()).isZero();

        var weekly = statsService.weekly(userId, LocalDate.parse("2026-08-10"), LocalDate.parse("2026-08-16"));
        assertThat(weekly.days()).hasSize(7);
        assertThat(weekly.days().getFirst().date()).isEqualTo(LocalDate.parse("2026-08-10"));
    }

    @Test
    void weeklyCountsTaskCompletionTimeInsteadOfLaterEdits() {
        AuthResult owner = identityService.register(
                "stats-task-" + UUID.randomUUID(), "phase-three-password", "Stats Test",
                new DeviceCommand("stats-device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB));
        UUID subjectId = subjectService.list(owner.user().id()).getFirst().id();
        UUID taskId = taskService.create(owner.user().id(), new TaskCommand(
                subjectId, "Complete me", null, TaskStatus.TODO, null, null, null, null, "001", null)).id();
        taskService.update(owner.user().id(), taskId, 0, new TaskCommand(
                subjectId, "Complete me", null, TaskStatus.DONE, null, null, null, null, "001", null));

        Instant completedAt = jdbcTemplate.queryForObject(
                "select completed_at from tasks where id = ?", Instant.class, taskId);
        jdbcTemplate.update("update tasks set updated_at = ? where id = ?",
                completedAt.plusSeconds(10 * 24 * 60 * 60L), taskId);

        LocalDate completionDate = completedAt.atZone(java.time.ZoneOffset.UTC).toLocalDate();
        LocalDate from = completionDate.minusDays(3);
        var weekly = statsService.weekly(owner.user().id(), from, from.plusDays(6));

        assertThat(weekly.days().get(3).completedTaskCount()).isEqualTo(1);
    }
}
