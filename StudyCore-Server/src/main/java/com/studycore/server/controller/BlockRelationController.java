package com.studycore.server.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.studycore.server.common.Result;
import com.studycore.server.entity.BlockRelation;
import com.studycore.server.service.BlockRelationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 块关联关系 CRUD 接口。
 * 
 * ⚠️ 注意：此接口目前前端未对接，关联关系暂由本地数据库维护。
 * 保留此 Controller 用于后续知识图谱功能的正式启用。
 */
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
