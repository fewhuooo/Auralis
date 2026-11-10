package com.auralis.app.ai.usage;

import java.time.Instant;

public final class AiUsageLimitException extends RuntimeException {

    private final String code;
    private final int status;
    private final long retryAfterSeconds;
    private final Instant resetAt;
    private final boolean capacityUnavailable;

    public AiUsageLimitException(String code, int status, long retryAfterSeconds, Instant resetAt) {
        this(code, status, retryAfterSeconds, resetAt, false);
    }

    private AiUsageLimitException(String code, int status, long retryAfterSeconds, Instant resetAt,
                                  boolean capacityUnavailable) {
        super(code);
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = Math.max(0, retryAfterSeconds);
        this.resetAt = resetAt;
        this.capacityUnavailable = capacityUnavailable;
    }

    static AiUsageLimitException capacityUnavailable(String code, int status, long retryAfterSeconds, Instant resetAt) {
        return new AiUsageLimitException(code, status, retryAfterSeconds, resetAt, true);
    }

    boolean capacityUnavailable() { return capacityUnavailable; }
    public String code() { return code; }
    public int status() { return status; }
    public long retryAfterSeconds() { return retryAfterSeconds; }
    public Instant resetAt() { return resetAt; }
}
