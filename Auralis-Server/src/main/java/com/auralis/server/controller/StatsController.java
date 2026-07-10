package com.auralis.server.controller;

import com.auralis.server.common.Result;
import com.auralis.server.common.UserContext;
import com.auralis.server.service.StatsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/overview")
    public Result<Map<String, Object>> getOverview() {
        String userId = UserContext.getCurrentUserId();
        Map<String, Object> data = statsService.getOverview(userId);
        return Result.success(data);
    }

    @GetMapping("/weekly")
    public Result<Map<String, Object>> getWeekly() {
        String userId = UserContext.getCurrentUserId();
        Map<String, Object> data = statsService.getWeeklyStats(userId);
        return Result.success(data);
    }
}
