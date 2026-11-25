package com.auralis.app;

import com.auralis.app.focus.FocusSessionCommand;
import com.auralis.app.focus.FocusSessionService;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.support.AuthTestAccounts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class StatsControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private FocusSessionService focusSessionService;

    @Test
    void weeklyUsesRequestedLocalDatesAndKeepsUtcDefaultAndOwnerScope() throws Exception {
        AuthResult owner = register();
        recordFocus(owner.user().id(), "2026-08-09T16:00:00Z");
        recordFocus(owner.user().id(), "2026-08-10T15:59:59Z");
        recordFocus(owner.user().id(), "2026-08-10T16:00:00Z");
        recordFocus(register().user().id(), "2026-08-10T15:59:59Z");
        String token = "Bearer " + owner.tokens().accessToken();

        mockMvc.perform(get("/api/stats/weekly").header("Authorization", token)
                        .param("from", "2026-08-10").param("to", "2026-08-16")
                        .param("timeZone", "Asia/Hong_Kong"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days.length()").value(7))
                .andExpect(jsonPath("$.days[0].date").value("2026-08-10"))
                .andExpect(jsonPath("$.days[0].focusSeconds").value(120))
                .andExpect(jsonPath("$.days[0].focusCompletedCount").value(2))
                .andExpect(jsonPath("$.days[1].focusSeconds").value(60))
                .andExpect(jsonPath("$.days[1].focusCompletedCount").value(1));
        mockMvc.perform(get("/api/stats/weekly").header("Authorization", token)
                        .param("from", "2026-08-10").param("to", "2026-08-16"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].focusSeconds").value(120))
                .andExpect(jsonPath("$.days[1].focusSeconds").value(0));
    }

    @ParameterizedTest
    @CsvSource({
            "2026-03-08,2026-03-09T03:59:59Z,2026-03-09T04:00:00Z",
            "2026-11-01,2026-11-02T04:59:59Z,2026-11-02T05:00:00Z"
    })
    void weeklyUsesCalendarDayBoundariesAcrossDaylightSavingTransitions(
            LocalDate from, Instant lastSecond, Instant nextDayStart) throws Exception {
        AuthResult owner = register();
        recordFocus(owner.user().id(), lastSecond.toString());
        recordFocus(owner.user().id(), nextDayStart.toString());

        mockMvc.perform(get("/api/stats/weekly")
                        .header("Authorization", "Bearer " + owner.tokens().accessToken())
                        .param("from", from.toString()).param("to", from.plusDays(6).toString())
                        .param("timeZone", "America/New_York"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].focusSeconds").value(60))
                .andExpect(jsonPath("$.days[1].focusSeconds").value(60));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Mars/Olympus", "+08:00"})
    void weeklyRejectsExplicitInvalidTimeZones(String timeZone) throws Exception {
        AuthResult owner = register();
        mockMvc.perform(get("/api/stats/weekly")
                        .header("Authorization", "Bearer " + owner.tokens().accessToken())
                        .param("from", "2026-08-10").param("to", "2026-08-16")
                        .param("timeZone", timeZone))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    private AuthResult register() {
        return AuthTestAccounts.register(identityService, "stats-zone-" + UUID.randomUUID(), "phase-three-password",
                new DeviceCommand("stats-zone-device-" + UUID.randomUUID(), "Test Device", DevicePlatform.WEB));
    }

    private void recordFocus(UUID userId, String endedAt) {
        Instant end = Instant.parse(endedAt);
        focusSessionService.record(userId, new FocusSessionCommand(
                UUID.randomUUID(), null, end.minusSeconds(60), end, 60, true));
    }

    @Test
    void statsRoutesRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/stats/overview")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/stats/weekly")).andExpect(status().isUnauthorized());
    }
}
