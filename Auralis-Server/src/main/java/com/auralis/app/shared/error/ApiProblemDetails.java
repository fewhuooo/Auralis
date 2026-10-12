package com.auralis.app.shared.error;

import java.net.URI;
import java.util.List;
import java.time.Instant;

public record ApiProblemDetails(
        URI type,
        String title,
        int status,
        String detail,
        String instance,
        String code,
        String traceId,
        List<FieldError> fieldErrors,
        Object current,
        Long retryAfterSeconds,
        Instant resetAt
) {
    public ApiProblemDetails(
            URI type,
            String title,
            int status,
            String detail,
            String instance,
            String code,
            String traceId,
            List<FieldError> fieldErrors) {
        this(type, title, status, detail, instance, code, traceId, fieldErrors, null, null, null);
    }

    public ApiProblemDetails(URI type, String title, int status, String detail, String instance,
            String code, String traceId, List<FieldError> fieldErrors, Object current) {
        this(type, title, status, detail, instance, code, traceId, fieldErrors, current, null, null);
    }

    public ApiProblemDetails {
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public record FieldError(String field, String message) {
    }
}
