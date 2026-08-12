package com.auralis.app.shared.error;

import com.auralis.app.shared.web.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;
import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(DomainException.class)
    ResponseEntity<ApiProblemDetails> handleDomain(
            DomainException exception,
            HttpServletRequest request
    ) {
        ApiErrorCode code;
        try {
            code = ApiErrorCode.valueOf(exception.code());
        } catch (IllegalArgumentException ignored) {
            code = ApiErrorCode.INTERNAL_ERROR;
        }
        HttpStatus status = switch (code) {
            case RESOURCE_NOT_FOUND, RESOURCE_DELETED -> HttpStatus.NOT_FOUND;
            case RESOURCE_VERSION_CONFLICT, MUTATION_REJECTED -> HttpStatus.CONFLICT;
            case VALIDATION_FAILED -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return response(status, code, exception.getMessage(), List.of(), exception.current(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiProblemDetails> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        List<ApiProblemDetails.FieldError> fieldErrors = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> new ApiProblemDetails.FieldError(error.getField(), error.getDefaultMessage()))
                .toList();

        return response(
                HttpStatus.BAD_REQUEST,
                ApiErrorCode.VALIDATION_FAILED,
                "Request validation failed",
                fieldErrors,
                null,
                request
        );
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiProblemDetails> handleNotFound(
            NoResourceFoundException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                ApiErrorCode.RESOURCE_NOT_FOUND,
                "Resource was not found",
                List.of(),
                null,
                request
        );
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiProblemDetails> handleUnexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                ApiErrorCode.INTERNAL_ERROR,
                "An unexpected error occurred",
                List.of(),
                null,
                request
        );
    }

    private ResponseEntity<ApiProblemDetails> response(
            HttpStatus status,
            ApiErrorCode code,
            String detail,
            List<ApiProblemDetails.FieldError> fieldErrors,
            Object current,
            HttpServletRequest request
    ) {
        String traceId = (String) request.getAttribute(TraceIdFilter.ATTRIBUTE);
        String instance = request.getRequestURI();
        ApiProblemDetails body = new ApiProblemDetails(
                URI.create("https://auralis.app/problems/" + code.name().toLowerCase()),
                status.getReasonPhrase(),
                status.value(),
                detail,
                instance,
                code.name(),
                traceId == null ? "missing-trace-id" : traceId,
                fieldErrors,
                current
        );

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(body);
    }

}
