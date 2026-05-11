package com.studycore.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.studycore.server.common.Result;
import com.studycore.server.entity.TaskBlock;
import com.studycore.server.service.TaskBlockService;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tasks")
public class TaskBlockController {

    private final TaskBlockService taskBlockService;

    public TaskBlockController(TaskBlockService taskBlockService) {
        this.taskBlockService = taskBlockService;
    }

    @PostMapping
    public Result<TaskBlock> createTask(@RequestBody TaskBlock taskBlock) {
        taskBlockService.save(taskBlock);
        return Result.success(taskBlock);
    }

    @GetMapping
    public Result<Page<TaskBlock>> getTasks(
            @RequestParam(required = false) String subject,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {

        LambdaQueryWrapper<TaskBlock> queryWrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(subject)) {
            queryWrapper.eq(TaskBlock::getSubject, subject);
        }
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(TaskBlock::getStatus, status);
        }

        Page<TaskBlock> pageResult = taskBlockService.page(new Page<>(page, size), queryWrapper);
        return Result.success(pageResult);
    }

    @PutMapping("/{id}")
    public Result<TaskBlock> updateTask(@PathVariable String id, @RequestBody TaskBlock taskBlock) {
        taskBlock.setId(id);
        taskBlockService.updateById(taskBlock);
        return Result.success(taskBlock);
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> deleteTask(@PathVariable String id) {
        return Result.success(taskBlockService.removeById(id));
    }
}
