package com.auralis.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.auralis.server.entity.BlockRelation;
import com.auralis.server.mapper.BlockRelationMapper;
import com.auralis.server.service.BlockRelationService;
import org.springframework.stereotype.Service;

@Service
public class BlockRelationServiceImpl extends ServiceImpl<BlockRelationMapper, BlockRelation> implements BlockRelationService {
}
