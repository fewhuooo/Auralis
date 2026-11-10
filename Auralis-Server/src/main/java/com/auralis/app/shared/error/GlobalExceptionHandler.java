package com.auralis.app.shared.error;

import com.auralis.app.shared.web.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.core.task.TaskRejectedException;

import java.net.URI;
import java.util.List;

import tools.jackson.databind.exc.InvalidFormatException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(TaskRejectedException.class)
    ResponseEntity<ApiProblemDetails> handleAsyncCapacity(TaskRejectedException exception,
                                                          HttpServletRequest request) {
        String traceId = (String) request.getAttribute(TraceIdFilter.ATTRIBUTE);
        ApiProblemDetails body = new ApiProblemDetails(
                URI.create("https://auralis.app/problems/service_unavailable"),
                HttpStatus.SERVICE_UNAVAILABLE.getReasonPhrase(), HttpStatus.SERVICE_UNAVAILABLE.value(),
                "Service is busy; retry shortly", request.getRequestURI(), ApiErrorCode.SERVICE_UNAVAILABLE.name(),
                traceId == null ? "missing-trace-id" : traceId, List.of(), null, 1L, null);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header("Retry-After", "1")
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(body);
    }

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
            case RESOURCE_VERSION_CONFLICT, MUTATION_REJECTED,
                    PARSED_DOCUMENT_CONFLICT, INGESTION_REVISION_STALE, CHAT_PROTOCOL_UNSUPPORTED,
                    CHAT_RUN_ACTIVE, CHAT_RUN_FENCE_LOST, CHAT_REQUEST_CONFLICT, CHAT_SCOPE_CONFLICT,
                    CHAT_PROFILE_CHANGED, CHAT_RETRY_NOT_ALLOWED,
                    CHAT_RECOVERY_NOT_ALLOWED,
                    CHAT_ACTIVITY_CONFLICT, CHAT_ACTIVITY_SUBMITTED, SOURCE_SCOPE_CHANGED -> HttpStatus.CONFLICT;
            case SOURCE_SCOPE_DENIED -> HttpStatus.FORBIDDEN;
            case VALIDATION_FAILED, UPLOAD_VALIDATION_FAILED, PARSED_DOCUMENT_INVALID,
                    CHAT_TOOL_ARGUMENT_INVALID, CHAT_TOOL_NOT_ALLOWED -> HttpStatus.BAD_REQUEST;
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case FORBIDDEN -> HttpStatus.FORBIDDEN;
            case MODEL_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case MODEL_TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
            case CHAT_ATTEMPT_DEADLINE -> HttpStatus.GATEWAY_TIMEOUT;
            case MODEL_PROVIDER_ERROR, OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE, OVERVIEW_PROMPT_BUDGET_EXCEEDED,
                    OVERVIEW_PROVIDER_OUTPUT_TRUNCATED, OVERVIEW_RECOVERY_EXHAUSTED,
                    OVERVIEW_REDUCE_NO_PROGRESS -> HttpStatus.BAD_GATEWAY;
            case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
            case INGESTION_FAILED -> HttpStatus.UNPROCESSABLE_ENTITY;
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

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiProblemDetails> handleUnreadableBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request
    ) {
        String field = fieldFrom(exception);
        String message = field == null
                ? "Request body could not be read"
                : "Invalid value for " + field;
        List<ApiProblemDetails.FieldError> fieldErrors = field == null
                ? List.of()
                : List.of(new ApiProblemDetails.FieldError(field, message));
        return response(
                HttpStatus.BAD_REQUEST,
                ApiErrorCode.VALIDATION_FAILED,
                message,
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

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    ResponseEntity<ApiProblemDetails> handleNotAcceptable(
            HttpMediaTypeNotAcceptableException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_ACCEPTABLE,
                ApiErrorCode.NOT_ACCEPTABLE,
                "No acceptable response representation is available",
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
        String traceId = (String) request.getAttribute(TraceIdFilter.ATTRIBUTE);
        log.error("UNEXPECTED_API_ERROR traceId={} method={} path={} exceptionType={}",
                traceId == null ? "missing-trace-id" : traceId,
                request.getMethod(),
                request.getRequestURI(),
                exception.getClass().getSimpleName(),
                exception);
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

    private String fieldFrom(HttpMessageNotReadableException exception) {
        Throwable cause = exception.getCause();
        if (!(cause instanceof InvalidFormatException invalidFormatException)) {
            return null;
        }
        var path = invalidFormatException.getPath();
        if (path.isEmpty()) {
            return null;
        }
        return path.getLast().getPropertyName();
    }

}
