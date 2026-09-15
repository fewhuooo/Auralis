package com.auralis.app.shared.error;

import com.auralis.app.shared.web.TraceIdFilter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

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
    void mapsModelTimeoutToGatewayTimeout() {
        var request = new MockHttpServletRequest("POST", "/api/ai/source-overviews");
        request.setAttribute(TraceIdFilter.ATTRIBUTE, "overview-timeout");

        var response = new GlobalExceptionHandler().handleDomain(
                new DomainException("MODEL_TIMEOUT", "AI provider response timed out"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
        assertThat(response.getBody().code()).isEqualTo("MODEL_TIMEOUT");
    }

    @ParameterizedTest
    @ValueSource(strings = {"OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE", "OVERVIEW_REDUCE_NO_PROGRESS"})
    void mapsOverviewBudgetFailuresToBadGateway(String code) {
        var request = new MockHttpServletRequest("POST", "/api/ai/source-overviews");

        var response = new GlobalExceptionHandler().handleDomain(
                new DomainException(code, "safe overview failure"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(response.getBody().code()).isEqualTo(code);
    }
}
