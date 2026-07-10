package com.auralis.server.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.auralis.server.entity.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {
}
