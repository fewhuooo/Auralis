package com.auralis.server.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.auralis.server.entity.User;

public interface UserService extends IService<User> {
    String login(String username, String password);
    void register(String username, String password);
}
