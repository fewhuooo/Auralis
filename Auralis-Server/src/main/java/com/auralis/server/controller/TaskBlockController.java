package com.auralis.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.auralis.server.common.Result;
import com.auralis.server.entity.TaskBlock;
import com.auralis.server.service.TaskBlockService;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

/**
 * 任务块直接 CRUD 接口。
 * 
 * ⚠️ 注意：自 Local-First 重构后，前端不再直接调用这些端点。
 * 所有任务块的增删改查通过 /api/sync/push 和 /api/sync/pull 进行。
 * 保留此 Controller 用于调试、管理后台或未来扩展。
 */
@RestController
@RequestMapping("/api/tasks")
@SuppressWarnings("null")
public class TaskBlockController {

    private final TaskBlockService taskBlockService;

    public TaskBlockController(TaskBlockService taskBlockService) {
        this.taskBlockService = taskBlockService;
    }

    @PostMapping
    public Result<TaskBlock> createTask(@RequestBody TaskBlock taskBlock) {
        taskBlock.setUserId(com.auralis.server.common.UserContext.getCurrentUserId());
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
         queryWrapper.eq(TaskBlock::getUserId, com.auralis.server.common.UserContext.getCurrentUserId());
         queryWrapper.and(w -> w.eq(TaskBlock::getIsDeleted, false).or().isNull(TaskBlock::getIsDeleted));
         
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
         TaskBlock existing = taskBlockService.getById(id);
         if (existing == null || !existing.getUserId().equals(com.auralis.server.common.UserContext.getCurrentUserId())) {
             throw new RuntimeException("Unauthorized");
         }
         taskBlock.setId(id);
         taskBlock.setUserId(existing.getUserId());
         taskBlockService.updateById(taskBlock);
         return Result.success(taskBlock);
     }
 
     @DeleteMapping("/{id}")
     public Result<Boolean> deleteTask(@PathVariable String id) {
         TaskBlock existing = taskBlockService.getById(id);
         if (existing == null || !existing.getUserId().equals(com.auralis.server.common.UserContext.getCurrentUserId())) {
             throw new RuntimeException("Unauthorized");
         }
         return Result.success(taskBlockService.removeById(id));
     }
}
