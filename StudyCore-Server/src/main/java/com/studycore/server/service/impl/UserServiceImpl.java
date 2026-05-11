package com.studycore.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.studycore.server.common.JwtUtil;
import com.studycore.server.entity.User;
import com.studycore.server.mapper.UserMapper;
import com.studycore.server.service.UserService;
import org.springframework.stereotype.Service;

@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, User> implements UserService {

    private final JwtUtil jwtUtil;

    public UserServiceImpl(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public String login(String username, String password) {
        User user = getOne(new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null || !user.getPassword().equals(password)) {
            throw new RuntimeException("Invalid username or password");
        }
        return jwtUtil.generateToken(username);
    }

    @Override
    public void register(String username, String password) {
        long count = count(new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (count > 0) {
            throw new RuntimeException("Username already exists");
        }
        User user = new User();
        user.setUsername(username);
        // Note: In a real app, passwords should be hashed (e.g. BCrypt)
        user.setPassword(password);
        save(user);
    }
}
