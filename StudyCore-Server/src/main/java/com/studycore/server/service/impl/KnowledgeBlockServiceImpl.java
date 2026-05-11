package com.studycore.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.studycore.server.entity.KnowledgeBlock;
import com.studycore.server.mapper.KnowledgeBlockMapper;
import com.studycore.server.service.KnowledgeBlockService;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeBlockServiceImpl extends ServiceImpl<KnowledgeBlockMapper, KnowledgeBlock> implements KnowledgeBlockService {
}
