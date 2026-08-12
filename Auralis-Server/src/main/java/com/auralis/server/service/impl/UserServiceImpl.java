package com.auralis.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.auralis.server.common.JwtUtil;
import com.auralis.server.entity.User;
import com.auralis.server.mapper.UserMapper;
import com.auralis.server.service.UserService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@SuppressWarnings("null")
public class UserServiceImpl extends ServiceImpl<UserMapper, User> implements UserService {

    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserServiceImpl(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public String login(String username, String password) {
        User user = getOne(new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null || !passwordMatches(password, user.getPassword())) {
            throw new RuntimeException("Invalid username or password");
        }
        if (!isBcryptHash(user.getPassword())) {
            user.setPassword(passwordEncoder.encode(password));
            updateById(user);
        }
        return jwtUtil.generateToken(username, user.getId());
    }

    @Override
    public void register(String username, String password) {
        long count = count(new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (count > 0) {
            throw new RuntimeException("Username already exists");
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        save(user);
    }

    private boolean passwordMatches(String rawPassword, String storedPassword) {
        if (storedPassword == null) {
            return false;
        }
        if (isBcryptHash(storedPassword)) {
            return passwordEncoder.matches(rawPassword, storedPassword);
        }
        return storedPassword.equals(rawPassword);
    }

    private boolean isBcryptHash(String value) {
        return value != null && (value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$"));
    }
}
