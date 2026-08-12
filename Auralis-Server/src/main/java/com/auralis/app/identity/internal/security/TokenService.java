package com.auralis.app.identity.internal.security;

import com.auralis.app.identity.TokenPair;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Component
public class TokenService {

    private final JwtEncoder jwtEncoder;
    private final AuralisProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    public TokenService(JwtEncoder jwtEncoder, AuralisProperties properties) {
        this.jwtEncoder = jwtEncoder;
        this.properties = properties;
    }

    public TokenPair issueTokenPair(UUID userId, UUID sessionId, UUID deviceId, Instant now, String refreshToken) {
        AuralisProperties.Identity identity = requireIdentityProperties();
        Instant accessExpiresAt = now.plusSeconds(identity.accessTokenTtlSeconds());
        return new TokenPair(
                issueAccessToken(userId, sessionId, deviceId, now, accessExpiresAt),
                refreshToken,
                identity.accessTokenTtlSeconds(),
                identity.refreshSessionTtlSeconds());
    }

    public String issueAccessToken(
            UUID userId, UUID sessionId, UUID deviceId, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(userId.toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("sid", sessionId.toString())
                .claim("did", deviceId.toString())
                .claim("typ", "access")
                .build();
        return jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    public String newRefreshToken() {
        byte[] value = new byte[32];
        secureRandom.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    public AuralisProperties.Identity requireIdentityProperties() {
        if (properties.identity() == null) {
            throw new IllegalStateException("Identity token properties are required");
        }
        return properties.identity();
    }
}
