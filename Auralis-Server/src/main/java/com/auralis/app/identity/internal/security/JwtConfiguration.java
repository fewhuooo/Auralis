package com.auralis.app.identity.internal.security;

import com.auralis.app.shared.config.AuralisProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.security.SecureRandom;

@Configuration(proxyBeanMethods = false)
public class JwtConfiguration {

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    Clock systemClock() {
        return Clock.systemUTC();
    }

    @Bean
    SecretKey jwtSecretKey(AuralisProperties properties, Environment environment) {
        String configuredSecret = properties.identity() == null ? null : properties.identity().jwtSecret();
        if (configuredSecret != null && !configuredSecret.isBlank()) {
            return new SecretKeySpec(configuredSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        }
        if (environment.matchesProfiles("prod")) {
            throw new IllegalStateException("AURALIS_JWT_SECRET must be configured in prod");
        }
        byte[] generated = new byte[32];
        new SecureRandom().nextBytes(generated);
        return new SecretKeySpec(generated, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtSecretKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSecretKey));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtSecretKey, Clock clock) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSecretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        JwtTimestampValidator timestampValidator = new JwtTimestampValidator();
        timestampValidator.setClock(clock);
        decoder.setJwtValidator(timestampValidator);
        return decoder;
    }
}
