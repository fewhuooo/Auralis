package com.auralis.app.task;

import com.auralis.app.shared.security.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.NO_CONTENT;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping
    @ResponseStatus(CREATED)
    public ResponseEntity<TaskDtos.Response> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody TaskDtos.CreateRequest request) {
        requireCreateVersion(request.baseVersion());
        TaskDtos.Response response = TaskDtos.Response.from(taskService.create(principal.userId(), request.command()));
        return ResponseEntity.status(CREATED)
                .location(URI.create("/api/tasks/" + response.id()))
                .body(response);
    }

    @GetMapping
    public TaskDtos.ListResponse list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        var page = taskService.list(principal.userId(), cursor, limit);
        return new TaskDtos.ListResponse(
                page.items().stream().map(TaskDtos.Response::from).toList(),
                page.nextCursor(), page.hasMore());
    }

    @GetMapping("/{id}")
    public TaskDtos.Response get(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id) {
        return TaskDtos.Response.from(taskService.get(principal.userId(), id));
    }

    @PutMapping("/{id}")
    public TaskDtos.Response update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody TaskDtos.UpdateRequest request) {
        return TaskDtos.Response.from(taskService.update(
                principal.userId(), id, request.baseVersion(), request.command()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(NO_CONTENT)
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody TaskDtos.VersionRequest request) {
        taskService.delete(principal.userId(), id, request.baseVersion());
        return ResponseEntity.status(NO_CONTENT).build();
    }

    @PostMapping("/{id}/restore")
    public TaskDtos.Response restore(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody TaskDtos.VersionRequest request) {
        return TaskDtos.Response.from(taskService.restore(
                principal.userId(), id, request.baseVersion()));
    }

    private void requireCreateVersion(Long baseVersion) {
        if (baseVersion != 0) {
            throw new com.auralis.app.shared.error.DomainException(
                    "VALIDATION_FAILED", "Create baseVersion must be 0");
        }
    }
}
