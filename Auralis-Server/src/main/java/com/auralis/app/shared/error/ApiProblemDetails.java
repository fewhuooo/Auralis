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
        List<FieldError> fieldErrors
) {
    public ApiProblemDetails {
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public record FieldError(String field, String message) {
    }
}
