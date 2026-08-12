package com.auralis.app.identity;

public record TokenPair(
        String accessToken,
        String refreshToken,
        long accessTokenExpiresInSeconds,
        long refreshTokenExpiresInSeconds) {
}
