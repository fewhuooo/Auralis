package com.auralis.app.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Locale;

@Service
class AuthEmailCodes {

    enum Purpose { REGISTRATION, PASSWORD_RESET }

    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final Duration SEND_INTERVAL = Duration.ofMinutes(1);
    private static final Duration SEND_WINDOW = Duration.ofHours(1);
    private static final int MAX_SENDS = 5;
    private static final int MAX_ATTEMPTS = 5;
    private static final String GLOBAL_BUCKET = "global-send-rate";
    private final SecretKey jwtSecretKey;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final int maxSendsPerMinute;
    private final SecureRandom random = new SecureRandom();

    AuthEmailCodes(SecretKey jwtSecretKey, JdbcTemplate jdbc, TransactionTemplate transactions, Clock clock,
            @Value("${auralis.mail.max-sends-per-minute:60}") int maxSendsPerMinute) {
        this.jwtSecretKey = jwtSecretKey;
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.clock = clock;
        this.maxSendsPerMinute = maxSendsPerMinute;
    }

    String issue(String email, Purpose purpose) {
        String emailKey = digest("email-address:" + email);
        return transactions.execute(status -> {
            jdbc.update("""
                    insert into auth_email_codes (email_key, purpose, send_window_at)
                    values (?, ?, ?) on conflict do nothing
                    """, GLOBAL_BUCKET, purpose.name(), timestamp(clock.instant()));
            Challenge global = lock(GLOBAL_BUCKET, purpose);
            Instant now = clock.instant();
            boolean globalWindowElapsed = !now.isBefore(global.sendWindowAt().plus(SEND_INTERVAL));
            if (!globalWindowElapsed && global.sends() >= maxSendsPerMinute) {
                return null;
            }

            jdbc.update("""
                    insert into auth_email_codes (email_key, purpose, send_window_at)
                    values (?, ?, ?) on conflict do nothing
                    """, emailKey, purpose.name(), timestamp(now));
            Challenge challenge = lock(emailKey, purpose);
            boolean windowElapsed = !now.isBefore(challenge.sendWindowAt().plus(SEND_WINDOW));
            if ((challenge.lastSentAt() != null && now.isBefore(challenge.lastSentAt().plus(SEND_INTERVAL)))
                    || (!windowElapsed && challenge.sends() >= MAX_SENDS)) {
                return null;
            }
            jdbc.update("""
                    update auth_email_codes set send_window_at = ?, sends = ? where email_key = ? and purpose = ?
                    """, timestamp(globalWindowElapsed ? now : global.sendWindowAt()),
                    globalWindowElapsed ? 1 : global.sends() + 1, GLOBAL_BUCKET, purpose.name());

            String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
            jdbc.update("""
                    update auth_email_codes
                    set code_hash = ?, expires_at = ?, last_sent_at = ?, send_window_at = ?, sends = ?, failed_attempts = 0
                    where email_key = ? and purpose = ?
                    """, codeHash(emailKey, purpose, code), timestamp(now.plus(CODE_TTL)), timestamp(now),
                    timestamp(windowElapsed ? now : challenge.sendWindowAt()), windowElapsed ? 1 : challenge.sends() + 1,
                    emailKey, purpose.name());
            return code;
        });
    }

    void consume(String email, Purpose purpose, String code) {
        String emailKey = digest("email-address:" + email);
        Challenge challenge = lock(emailKey, purpose);
        if (challenge == null || challenge.codeHash() == null || !clock.instant().isBefore(challenge.expiresAt())
                || challenge.failedAttempts() >= MAX_ATTEMPTS) {
            throw new InvalidEmailCodeException();
        }
        if (!MessageDigest.isEqual(challenge.codeHash().getBytes(StandardCharsets.US_ASCII),
                codeHash(emailKey, purpose, code).getBytes(StandardCharsets.US_ASCII))) {
            jdbc.update("""
                    update auth_email_codes set failed_attempts = failed_attempts + 1
                    where email_key = ? and purpose = ?
                    """, emailKey, purpose.name());
            throw new InvalidEmailCodeException();
        }
        jdbc.update("""
                update auth_email_codes set code_hash = null, expires_at = null
                where email_key = ? and purpose = ?
                """, emailKey, purpose.name());
    }

    @Scheduled(fixedDelay = 3_600_000L)
    void purgeExpired() {
        jdbc.update("delete from auth_email_codes where send_window_at < ? and email_key <> ?",
                timestamp(clock.instant().minus(Duration.ofDays(1))), GLOBAL_BUCKET);
    }

    private Challenge lock(String emailKey, Purpose purpose) {
        return jdbc.query("""
                select code_hash, expires_at, last_sent_at, send_window_at, sends, failed_attempts
                from auth_email_codes where email_key = ? and purpose = ? for update
                """, rows -> rows.next() ? new Challenge(
                rows.getString("code_hash"),
                instant(rows.getObject("expires_at", OffsetDateTime.class)),
                instant(rows.getObject("last_sent_at", OffsetDateTime.class)),
                rows.getObject("send_window_at", OffsetDateTime.class).toInstant(),
                rows.getInt("sends"), rows.getInt("failed_attempts")) : null,
                emailKey, purpose.name());
    }

    private String codeHash(String emailKey, Purpose purpose, String code) {
        return digest("email-code:" + purpose.name() + ":" + emailKey + ":" + code);
    }

    private String digest(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(jwtSecretKey);
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Could not initialize email verification MAC", exception);
        }
    }

    private static Instant instant(OffsetDateTime value) {
        return value == null ? null : value.toInstant();
    }

    private static OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private record Challenge(
            String codeHash, Instant expiresAt, Instant lastSentAt, Instant sendWindowAt, int sends, int failedAttempts) {
    }
}
