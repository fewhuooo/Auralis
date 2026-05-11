package com.studycore.server.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.studycore.server.entity.TaskBlock;
import com.studycore.server.mapper.TaskBlockMapper;
import com.studycore.server.service.TaskBlockService;
import org.springframework.stereotype.Service;

@Service
public class TaskBlockServiceImpl extends ServiceImpl<TaskBlockMapper, TaskBlock> implements TaskBlockService {
}
