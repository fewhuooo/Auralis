package com.studycore.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.studycore.server.entity.BlockRelation;
import com.studycore.server.mapper.BlockRelationMapper;
import com.studycore.server.service.BlockRelationService;
import org.springframework.stereotype.Service;

@Service
public class BlockRelationServiceImpl extends ServiceImpl<BlockRelationMapper, BlockRelation> implements BlockRelationService {
}
