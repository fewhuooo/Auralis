package com.auralis.app.identity;

import com.auralis.app.shared.error.ApiErrorCode;
import com.auralis.app.shared.error.ApiProblemDetails;
import com.auralis.app.shared.web.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class IdentityExceptionHandler {

    @ExceptionHandler(IdentityException.class)
    ResponseEntity<ApiProblemDetails> handle(
            IdentityException exception,
            HttpServletRequest request) {
        ApiErrorCode code = toApiErrorCode(exception.code());
        HttpStatus status = statusFor(code);
        String traceId = (String) request.getAttribute(TraceIdFilter.ATTRIBUTE);
        ApiProblemDetails body = new ApiProblemDetails(
                URI.create("https://auralis.app/problems/" + code.name().toLowerCase()),
                status.getReasonPhrase(),
                status.value(),
                exception.getMessage(),
                request.getRequestURI(),
                code.name(),
                traceId == null ? "missing-trace-id" : traceId,
                exception instanceof InvalidEmailCodeException
                        ? List.of(new ApiProblemDetails.FieldError("emailCode", exception.getMessage()))
                        : List.of(),
                null);
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(body);
    }

    private ApiErrorCode toApiErrorCode(String code) {
        try {
            return ApiErrorCode.valueOf(code);
        } catch (IllegalArgumentException exception) {
            return ApiErrorCode.INTERNAL_ERROR;
        }
    }

    private HttpStatus statusFor(ApiErrorCode code) {
        return switch (code) {
            case VALIDATION_FAILED -> HttpStatus.BAD_REQUEST;
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case FORBIDDEN -> HttpStatus.FORBIDDEN;
            case RESOURCE_NOT_FOUND, RESOURCE_DELETED -> HttpStatus.NOT_FOUND;
            case MUTATION_REJECTED, RESOURCE_VERSION_CONFLICT -> HttpStatus.CONFLICT;
            case SERVICE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_REQUEST;
        };
    }
}
