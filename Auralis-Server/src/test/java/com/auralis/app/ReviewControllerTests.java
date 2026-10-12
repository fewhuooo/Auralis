package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class ReviewControllerTests {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    void deprecatedReviewRoutesAreNotMapped() {
        var routePatterns = handlerMapping.getHandlerMethods().keySet().stream()
                .flatMap(mapping -> mapping.getPatternValues().stream())
                .collect(Collectors.toSet());

        assertThat(routePatterns).doesNotContain(
                "/api/reviews/due",
                "/api/reviews/events",
                "/api/reviews/history");
        assertThat(routePatterns).contains(
                "/api/reviews/states",
                "/api/reviews/lifecycle/history");
    }
}
