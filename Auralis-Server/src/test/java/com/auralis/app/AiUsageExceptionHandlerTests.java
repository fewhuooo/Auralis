package com.auralis.app;

import com.auralis.app.ai.AiUsageExceptionHandler;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.error.GlobalExceptionHandler;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.nullValue;

class AiUsageExceptionHandlerTests {

    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ErrorController())
            .setControllerAdvice(new GlobalExceptionHandler(), new AiUsageExceptionHandler())
            .build();

    @ParameterizedTest
    @CsvSource({
            "AI_REQUEST_BUDGET_EXCEEDED,413,0",
            "AI_TASK_BUDGET_EXCEEDED,422,0",
            "AI_CONCURRENCY_LIMIT,429,90",
            "AI_HOURLY_QUOTA_EXCEEDED,429,90",
            "AI_DAILY_QUOTA_EXCEEDED,429,90",
            "AI_GLOBAL_QUOTA_EXCEEDED,503,90"
    })
    void mapsEveryUsageLimitThroughMvcWithSafeRetryMetadata(String code, int expectedStatus, long retryAfter)
            throws Exception {
        var request = mockMvc.perform(get("/test/ai-limit/{code}", code));
        request
                .andExpect(status().is(expectedStatus))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(expectedStatus))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.detail").value("AI usage limit reached"))
                .andExpect(jsonPath("$.retryAfterSeconds").value(retryAfter));
        if (retryAfter == 0) {
            request.andExpect(header().doesNotExist("Retry-After"))
                    .andExpect(jsonPath("$.resetAt").value(nullValue()));
        } else {
            request.andExpect(header().string("Retry-After", Long.toString(retryAfter)))
                    .andExpect(jsonPath("$.resetAt").value("2026-10-11T00:00:00Z"));
        }
    }

    @Test
    void regularDomainFailuresStillUseSharedProblemDetailsHandler() throws Exception {
        mockMvc.perform(get("/test/domain-error"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESOURCE_VERSION_CONFLICT"))
                .andExpect(jsonPath("$.detail").value("safe domain conflict"));
    }

    @RestController
    static class ErrorController {
        @GetMapping("/test/ai-limit/{code}")
        void aiLimit(@PathVariable String code) {
            int status = switch (code) {
                case "AI_REQUEST_BUDGET_EXCEEDED" -> 413;
                case "AI_TASK_BUDGET_EXCEEDED" -> 422;
                case "AI_GLOBAL_QUOTA_EXCEEDED" -> 503;
                default -> 429;
            };
            long retryAfter = status == 413 || status == 422 ? 0 : 90;
            throw new AiUsageLimitException(code, status, retryAfter,
                    retryAfter == 0 ? null : Instant.parse("2026-10-11T00:00:00Z"));
        }

        @GetMapping("/test/domain-error")
        void domainError() {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "safe domain conflict");
        }
    }
}
