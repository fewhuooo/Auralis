package com.auralis.app.stats;

import com.auralis.app.shared.security.AuthenticatedUser;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/stats")
public class StatsController {
    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/overview")
    public StatsOverviewView overview(@AuthenticationPrincipal AuthenticatedUser user,
                                      @RequestParam(required = false)
                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant at) {
        return statsService.overview(user.userId(), at == null ? Instant.now() : at);
    }

    @GetMapping("/weekly")
    public WeeklyStatsView weekly(@AuthenticationPrincipal AuthenticatedUser user,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                  @RequestParam(required = false) String timeZone) {
        return statsService.weekly(user.userId(), from, to, timeZone);
    }

    @GetMapping("/subjects/{subjectId}")
    public SubjectStatsView subject(@AuthenticationPrincipal AuthenticatedUser user,
                                    @PathVariable UUID subjectId,
                                    @RequestParam(defaultValue = "7") int days,
                                    @RequestParam String timeZone) {
        return statsService.subject(user.userId(), subjectId, days, timeZone);
    }
}
