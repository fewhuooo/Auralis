package com.studycore.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.studycore.server.common.Result;
import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.service.KnowledgeBlockService;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/blocks")
public class KnowledgeBlockController {

    private final KnowledgeBlockService knowledgeBlockService;

    public KnowledgeBlockController(KnowledgeBlockService knowledgeBlockService) {
        this.knowledgeBlockService = knowledgeBlockService;
    }

    @PostMapping
    public Result<KnowledgeBlock> createBlock(@RequestBody KnowledgeBlock block) {
        knowledgeBlockService.save(block);
        return Result.success(block);
    }

    @GetMapping
    public Result<Page<KnowledgeBlock>> getBlocks(
            @RequestParam(required = false) String subject,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {
        
        LambdaQueryWrapper<KnowledgeBlock> queryWrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(subject)) {
            queryWrapper.eq(KnowledgeBlock::getSubject, subject);
        }
        queryWrapper.orderByDesc(KnowledgeBlock::getTime);
        
        Page<KnowledgeBlock> pageResult = knowledgeBlockService.page(new Page<>(page, size), queryWrapper);
        return Result.success(pageResult);
    }

    @PutMapping("/{id}")
    public Result<KnowledgeBlock> updateBlock(@PathVariable String id, @RequestBody KnowledgeBlock block) {
        block.setId(id);
        knowledgeBlockService.updateById(block);
        return Result.success(block);
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> deleteBlock(@PathVariable String id) {
        return Result.success(knowledgeBlockService.removeById(id));
    }
}
