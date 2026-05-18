package com.studycore.server.controller;

import com.studycore.server.common.JwtUtil;
import com.studycore.server.common.Result;
import com.studycore.server.service.UserService;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final JwtUtil jwtUtil;

    public AuthController(UserService userService, JwtUtil jwtUtil) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/login")
    public Result<Map<String, String>> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String accessToken = userService.login(username, request.get("password"));
        String refreshToken = jwtUtil.generateRefreshToken(username);

        Map<String, String> tokens = new HashMap<>();
        tokens.put("accessToken", accessToken);
        tokens.put("refreshToken", refreshToken);
        return Result.success(tokens);
    }

    @PostMapping("/register")
    public Result<Boolean> register(@RequestBody Map<String, String> request) {
        userService.register(request.get("username"), request.get("password"));
        return Result.success(true);
    }

    /**
     * 14.3 Refresh Token endpoint
     * Accepts a valid refresh token and returns a new access + refresh token pair.
     */
    @PostMapping("/refresh")
    public Result<Map<String, String>> refresh(@RequestBody Map<String, String> request) {
        String refreshToken = request.get("refreshToken");
        if (refreshToken == null || !jwtUtil.validateToken(refreshToken) || !jwtUtil.isRefreshToken(refreshToken)) {
            throw new RuntimeException("Invalid or expired refresh token");
        }

        String username = jwtUtil.extractUsername(refreshToken);
        String newAccessToken = jwtUtil.generateToken(username);
        String newRefreshToken = jwtUtil.generateRefreshToken(username);

        Map<String, String> tokens = new HashMap<>();
        tokens.put("accessToken", newAccessToken);
        tokens.put("refreshToken", newRefreshToken);
        return Result.success(tokens);
    }
}
