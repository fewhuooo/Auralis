package com.auralis.app.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService syncService;
    private final ObjectMapper objectMapper;

    public SyncController(SyncService syncService, ObjectMapper objectMapper) {
        this.syncService = syncService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/push")
    public SyncDtos.PushResponse push(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody SyncDtos.PushRequest request) {
        var results = syncService.push(principal.userId(), request.deviceId(), request.toMutations())
                .stream().map(this::toResponse).toList();
        String cursor = syncService.latestCursor(principal.userId()).encode();
        return new SyncDtos.PushResponse(results, cursor);
    }

    @GetMapping("/pull")
    public SyncDtos.PullResponse pull(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        ChangeLogPage page = syncService.pull(principal.userId(), cursor, limit);
        return new SyncDtos.PullResponse(
                page.changes().stream().map(entry -> SyncDtos.ChangeResponse.from(entry, objectMapper)).toList(),
                page.nextCursor().encode(), page.hasMore(), page.resetRequired());
    }

    @GetMapping("/snapshot")
    public SyncDtos.SnapshotResponse snapshot(@AuthenticationPrincipal AuthenticatedUser principal) {
        return syncService.snapshot(principal.userId());
    }

    private SyncDtos.MutationResponse toResponse(SyncDtos.MutationResponse response) {
        return response;
    }
}
