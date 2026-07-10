package com.auralis.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.auralis.server.entity.MutationLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MutationLogMapper extends BaseMapper<MutationLog> {
}
