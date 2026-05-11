package com.studycore.server.controller;

import com.studycore.server.common.Result;
import com.studycore.server.service.UserService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/login")
    public Result<String> login(@RequestBody Map<String, String> request) {
        String token = userService.login(request.get("username"), request.get("password"));
        return Result.success(token);
    }

    @PostMapping("/register")
    public Result<Boolean> register(@RequestBody Map<String, String> request) {
        userService.register(request.get("username"), request.get("password"));
        return Result.success(true);
    }
}
