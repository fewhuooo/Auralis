package com.auralis.app.identity.internal.security;

import com.auralis.app.shared.security.AuthenticatedUser;
import com.auralis.app.identity.UserStatus;
import com.auralis.app.identity.internal.persistence.UserRepository;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class JwtAuthenticationFilter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final UserRepository userRepository;

    public JwtAuthenticationFilter(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        if (!"access".equals(jwt.getClaimAsString("typ"))) {
            throw new BadCredentialsException("Only access tokens are accepted");
        }
        try {
            UUID userId = UUID.fromString(jwt.getSubject());
            if (userRepository.findById(userId).filter(user -> user.getStatus() == UserStatus.ACTIVE).isEmpty()) {
                throw new BadCredentialsException("Account is unavailable");
            }
            AuthenticatedUser principal = new AuthenticatedUser(
                    userId,
                    UUID.fromString(requiredClaim(jwt, "sid")),
                    UUID.fromString(requiredClaim(jwt, "serverDeviceId")));
            return new UsernamePasswordAuthenticationToken(
                    principal,
                    jwt,
                    AuthorityUtils.NO_AUTHORITIES);
        } catch (IllegalArgumentException exception) {
            throw new BadCredentialsException("Invalid access token claims", exception);
        }
    }

    private String requiredClaim(Jwt jwt, String name) {
        String value = jwt.getClaimAsString(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing " + name);
        }
        return value;
    }
}
