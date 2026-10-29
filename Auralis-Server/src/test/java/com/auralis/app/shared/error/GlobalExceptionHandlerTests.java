package com.auralis.app.shared.error;

import com.auralis.app.shared.web.TraceIdFilter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(OutputCaptureExtension.class)
class GlobalExceptionHandlerTests {

    @Test
    void logsUnexpectedFailuresWithRequestTraceContext(CapturedOutput output) {
        var request = new MockHttpServletRequest("POST", "/api/sync/push");
        request.setAttribute(TraceIdFilter.ATTRIBUTE, "sync-trace-123");

        var response = new GlobalExceptionHandler().handleUnexpected(
                new IllegalStateException("unexpected sync failure"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(output).contains("UNEXPECTED_API_ERROR");
        assertThat(output).contains("traceId=sync-trace-123");
        assertThat(output).contains("exceptionType=IllegalStateException");
    }

    @Test
    void mapsNotAcceptableNegotiationFailureTo406ProblemDetails() {
        var request = new MockHttpServletRequest("POST", "/api/ai/subject-overviews");
        request.addHeader("Accept", MediaType.TEXT_EVENT_STREAM_VALUE);

        var response = new GlobalExceptionHandler().handleNotAcceptable(
                new HttpMediaTypeNotAcceptableException(List.of(MediaType.APPLICATION_JSON)), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_ACCEPTABLE);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(response.getBody().code()).isEqualTo("NOT_ACCEPTABLE");
        assertThat(response.getBody().status()).isEqualTo(406);
    }

    @Test
    void mapsModelTimeoutToGatewayTimeout() {
        var request = new MockHttpServletRequest("POST", "/api/ai/source-overviews");
        request.setAttribute(TraceIdFilter.ATTRIBUTE, "overview-timeout");

        var response = new GlobalExceptionHandler().handleDomain(
                new DomainException("MODEL_TIMEOUT", "AI provider response timed out"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
        assertThat(response.getBody().code()).isEqualTo("MODEL_TIMEOUT");
    }

    @ParameterizedTest
    @ValueSource(strings = {"CHAT_RUN_ACTIVE", "CHAT_PROFILE_CHANGED"})
    void mapsChatAdmissionAndProfileConflictsTo409(String code) {
        var request = new MockHttpServletRequest("POST", "/api/ai/messages/stream");

        var response = new GlobalExceptionHandler().handleDomain(
                new DomainException(code, "Chat request conflicts with current run state"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo(code);
    }

    @ParameterizedTest
    @ValueSource(strings = {"OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE", "OVERVIEW_PROMPT_BUDGET_EXCEEDED",
            "OVERVIEW_PROVIDER_OUTPUT_TRUNCATED", "OVERVIEW_RECOVERY_EXHAUSTED", "OVERVIEW_REDUCE_NO_PROGRESS"})
    void mapsOverviewBudgetFailuresToBadGateway(String code) {
        var request = new MockHttpServletRequest("POST", "/api/ai/source-overviews");

        var response = new GlobalExceptionHandler().handleDomain(
                new DomainException(code, "safe overview failure"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(response.getBody().code()).isEqualTo(code);
    }

    @Test
    void mapsAsyncCapacityRejectionToSafeServiceUnavailableResponse() {
        var request = new MockHttpServletRequest("POST", "/api/ai/messages/stream");
        var response = new GlobalExceptionHandler().handleAsyncCapacity(
                new TaskRejectedException("executor saturated with sensitive request details"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("1");
        assertThat(response.getBody().code()).isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(response.getBody().detail()).isEqualTo("Service is busy; retry shortly");
        assertThat(response.getBody().retryAfterSeconds()).isEqualTo(1L);
        assertThat(response.getBody().resetAt()).isNull();
        assertThat(response.getBody().detail()).doesNotContain("sensitive", "executor");
    }
}
