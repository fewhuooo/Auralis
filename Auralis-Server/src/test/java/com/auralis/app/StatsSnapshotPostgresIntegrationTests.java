package com.auralis.app;

import com.auralis.app.focus.FocusSessionCommand;
import com.auralis.app.focus.FocusSessionService;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.stats.StatsService;
import com.auralis.app.stats.internal.StatsQueryRepository;
import com.auralis.app.support.AuthTestAccounts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;

@EnabledIfSystemProperty(named = "auralis.usage.postgres.url", matches = "jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+")
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles({"test", "postgres-it"})
class StatsSnapshotPostgresIntegrationTests {

    private static final Instant ENDED_AT = Instant.parse("2026-01-01T12:00:00Z");
    private static final int FOCUS_SECONDS = 300;

    @Autowired private IdentityService identityService;
    @Autowired private FocusSessionService focusSessionService;
    @Autowired private StatsService statsService;
    @MockitoSpyBean private StatsQueryRepository queryRepository;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("auralis.usage.postgres.url"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
    }

    @Test
    void overviewKeepsFocusSecondsAndCompletedCountInTheSameSnapshot() {
        UUID userId = registerOwner();
        doAnswer(invocation -> {
            long seconds = (long) invocation.callRealMethod();
            commitFocusSession(userId);
            return seconds;
        }).doCallRealMethod().when(queryRepository).focusSecondsUntil(userId, ENDED_AT);

        var duringUpload = statsService.overview(userId, ENDED_AT);
        assertThat(duringUpload.focusSeconds()).isZero();
        assertThat(duringUpload.focusCompletedCount()).isZero();

        var afterUpload = statsService.overview(userId, ENDED_AT);
        assertThat(afterUpload.focusSeconds()).isEqualTo(FOCUS_SECONDS);
        assertThat(afterUpload.focusCompletedCount()).isOne();
    }

    @Test
    void weeklyKeepsFocusSecondsAndCompletedCountInTheSameSnapshot() {
        UUID userId = registerOwner();
        LocalDate from = LocalDate.parse("2026-01-01");
        LocalDate to = from.plusDays(6);
        Instant start = Instant.parse("2026-01-01T00:00:00Z");
        Instant end = Instant.parse("2026-01-02T00:00:00Z");
        doAnswer(invocation -> {
            long seconds = (long) invocation.callRealMethod();
            commitFocusSession(userId);
            return seconds;
        }).doCallRealMethod().when(queryRepository).focusSeconds(userId, start, end);

        var duringUpload = statsService.weekly(userId, from, to, "UTC").days().getFirst();
        assertThat(duringUpload.focusSeconds()).isZero();
        assertThat(duringUpload.focusCompletedCount()).isZero();

        var afterUpload = statsService.weekly(userId, from, to, "UTC").days().getFirst();
        assertThat(afterUpload.focusSeconds()).isEqualTo(FOCUS_SECONDS);
        assertThat(afterUpload.focusCompletedCount()).isOne();
    }

    private UUID registerOwner() {
        return AuthTestAccounts.register(identityService, "stats-snapshot-" + UUID.randomUUID(), "phase-three-password",
                new DeviceCommand("stats-snapshot-device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB)).user().id();
    }

    private void commitFocusSession(UUID userId) throws Exception {
        var executor = Executors.newSingleThreadExecutor();
        try {
            executor.submit(() -> focusSessionService.record(userId, new FocusSessionCommand(UUID.randomUUID(), null,
                    ENDED_AT.minusSeconds(FOCUS_SECONDS), ENDED_AT, FOCUS_SECONDS, true))).get(10, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
    }
}
