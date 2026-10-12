package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.error.ApiProblemDetails;
import com.auralis.app.shared.web.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatusCode;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;

@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AiUsageExceptionHandler {

    @ExceptionHandler(AiUsageLimitException.class)
    ResponseEntity<ApiProblemDetails> handle(AiUsageLimitException exception, HttpServletRequest request) {
        String traceId = (String) request.getAttribute(TraceIdFilter.ATTRIBUTE);
        long retryAfter = Math.max(0, exception.retryAfterSeconds());
        ApiProblemDetails body = new ApiProblemDetails(
                URI.create("https://auralis.app/problems/" + exception.code().toLowerCase()),
                HttpStatusCode.valueOf(exception.status()).toString(), exception.status(),
                "AI usage limit reached", request.getRequestURI(), exception.code(),
                traceId == null ? "missing-trace-id" : traceId, List.of(), null,
                retryAfter, exception.resetAt());
        ResponseEntity.BodyBuilder response = ResponseEntity.status(exception.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON);
        if (retryAfter > 0) {
            response.header("Retry-After", Long.toString(retryAfter));
        }
        return response.body(body);
    }
}
