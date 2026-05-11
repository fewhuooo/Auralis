package com.studycore.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.studycore.server.common.Result;
import com.studycore.server.entity.BlockRelation;
import com.studycore.server.service.BlockRelationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/relations")
public class BlockRelationController {

    private final BlockRelationService blockRelationService;

    public BlockRelationController(BlockRelationService blockRelationService) {
        this.blockRelationService = blockRelationService;
    }

    @PostMapping
    public Result<BlockRelation> createRelation(@RequestBody BlockRelation relation) {
        blockRelationService.save(relation);
        return Result.success(relation);
    }

    @GetMapping
    public Result<List<BlockRelation>> getRelations(
            @RequestParam(required = false) String sourceId,
            @RequestParam(required = false) String targetId) {

        LambdaQueryWrapper<BlockRelation> queryWrapper = new LambdaQueryWrapper<>();
        if (sourceId != null) {
            queryWrapper.eq(BlockRelation::getSourceId, sourceId);
        }
        if (targetId != null) {
            queryWrapper.eq(BlockRelation::getTargetId, targetId);
        }

        return Result.success(blockRelationService.list(queryWrapper));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> deleteRelation(@PathVariable String id) {
        return Result.success(blockRelationService.removeById(id));
    }
}
