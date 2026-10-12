package com.auralis.app.ai.usage;

import java.time.Instant;

public final class AiUsageLimitException extends RuntimeException {

    private final String code;
    private final int status;
    private final long retryAfterSeconds;
    private final Instant resetAt;

    public AiUsageLimitException(String code, int status, long retryAfterSeconds, Instant resetAt) {
        super(code);
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = Math.max(0, retryAfterSeconds);
        this.resetAt = resetAt;
    }

    public String code() { return code; }
    public int status() { return status; }
    public long retryAfterSeconds() { return retryAfterSeconds; }
    public Instant resetAt() { return resetAt; }
}
