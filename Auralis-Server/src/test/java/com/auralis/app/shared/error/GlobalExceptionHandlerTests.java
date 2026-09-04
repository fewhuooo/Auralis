package com.auralis.app.shared.error;

import com.auralis.app.shared.web.TraceIdFilter;
import org.junit.jupiter.api.Test;
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
}
