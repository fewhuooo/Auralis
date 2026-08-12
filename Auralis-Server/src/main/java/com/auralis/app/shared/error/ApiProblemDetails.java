package com.auralis.app.shared.error;

import java.net.URI;
import java.util.List;

public record ApiProblemDetails(
        URI type,
        String title,
        int status,
        String detail,
        String instance,
        String code,
        String traceId,
        List<FieldError> fieldErrors,
        Object current
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
        this(type, title, status, detail, instance, code, traceId, fieldErrors, null);
    }

    public ApiProblemDetails {
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public record FieldError(String field, String message) {
    }
}
