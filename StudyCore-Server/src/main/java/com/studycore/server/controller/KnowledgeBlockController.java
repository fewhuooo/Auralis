package com.studycore.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.studycore.server.common.Result;
import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.service.KnowledgeBlockService;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

/**
 * 知识块直接 CRUD 接口。
 * 
 * ⚠️ 注意：自 Local-First 重构后，前端不再直接调用这些端点。
 * 所有知识块的增删改查通过 /api/sync/push 和 /api/sync/pull 进行。
 * 保留此 Controller 用于调试、管理后台或未来扩展。
 */
@RestController
@RequestMapping("/api/blocks")
public class KnowledgeBlockController {

    private final KnowledgeBlockService knowledgeBlockService;

    public KnowledgeBlockController(KnowledgeBlockService knowledgeBlockService) {
        this.knowledgeBlockService = knowledgeBlockService;
    }

    @PostMapping
    public Result<KnowledgeBlock> createBlock(@RequestBody KnowledgeBlock block) {
        block.setUserId(com.studycore.server.common.UserContext.getCurrentUserId());
        knowledgeBlockService.save(block);
        return Result.success(block);
    }

    @GetMapping
    public Result<Page<KnowledgeBlock>> getBlocks(
            @RequestParam(required = false) String subject,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {
        
        LambdaQueryWrapper<KnowledgeBlock> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(KnowledgeBlock::getUserId, com.studycore.server.common.UserContext.getCurrentUserId());
        queryWrapper.and(w -> w.eq(KnowledgeBlock::getIsDeleted, false).or().isNull(KnowledgeBlock::getIsDeleted));
        
        if (StringUtils.hasText(subject)) {
            queryWrapper.eq(KnowledgeBlock::getSubject, subject);
        }
        queryWrapper.orderByDesc(KnowledgeBlock::getTime);
        
        Page<KnowledgeBlock> pageResult = knowledgeBlockService.page(new Page<>(page, size), queryWrapper);
        return Result.success(pageResult);
    }

    @PutMapping("/{id}")
    public Result<KnowledgeBlock> updateBlock(@PathVariable String id, @RequestBody KnowledgeBlock block) {
        KnowledgeBlock existing = knowledgeBlockService.getById(id);
        if (existing == null || !existing.getUserId().equals(com.studycore.server.common.UserContext.getCurrentUserId())) {
            throw new RuntimeException("Unauthorized");
        }
        block.setId(id);
        block.setUserId(existing.getUserId());
        knowledgeBlockService.updateById(block);
        return Result.success(block);
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> deleteBlock(@PathVariable String id) {
        KnowledgeBlock existing = knowledgeBlockService.getById(id);
        if (existing == null || !existing.getUserId().equals(com.studycore.server.common.UserContext.getCurrentUserId())) {
            throw new RuntimeException("Unauthorized");
        }
        return Result.success(knowledgeBlockService.removeById(id));
    }
}
