package com.auralis.app.shared.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.HandlerMethod;

import java.util.Set;

@Configuration
public class OpenApiConfiguration {
    private static final String AUTH_CONTROLLER = "com.auralis.app.identity.AuthController";
    private static final Set<String> PUBLIC_AUTH_METHODS = Set.of("register", "login", "refresh");

    @Bean
    OpenAPI auralisOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Auralis API")
                        .version("0.1.0")
                        .description("阶段 0 仅提供健康检查和文档；业务路由按绿地重写计划分阶段开放。"));
    }

    @Bean
    OperationCustomizer auralisSecurityRequirement() {
        return (Operation operation, HandlerMethod handlerMethod) -> {
            if (!AUTH_CONTROLLER.equals(handlerMethod.getBeanType().getName())
                    || !PUBLIC_AUTH_METHODS.contains(handlerMethod.getMethod().getName())) {
                operation.addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
            }
            return operation;
        };
    }

    @Bean
    OpenApiCustomizer overviewNullableReferenceSchemas() {
        return openApi -> {
            normalizeNullableReference(openApi, "OverviewResultView", "outlineIdentity");
            normalizeNullableReference(openApi, "OverviewResultView", "outlineProvenance");
            normalizeNullableReference(openApi, "OverviewResultCommand", "outlineIdentity");
            normalizeNullableReference(openApi, "OverviewResultCommand", "outlineProvenance");
        };
    }

    @SuppressWarnings("rawtypes")
    private static void normalizeNullableReference(OpenAPI openApi, String componentName, String propertyName) {
        Schema component = openApi.getComponents().getSchemas().get(componentName);
        if (component == null || component.getProperties() == null
                || !(component.getProperties().get(propertyName) instanceof Schema property)) {
            throw new IllegalStateException("Missing OpenAPI schema property " + componentName + "." + propertyName);
        }
        String reference = property.get$ref();
        if (reference == null || reference.isBlank()) {
            throw new IllegalStateException("Expected OpenAPI reference for " + componentName + "." + propertyName);
        }

        property.set$ref(null);
        property.setType(null);
        property.setTypes(null);

        Schema<?> nullSchema = new Schema<>();
        nullSchema.setType("null");
        nullSchema.setTypes(Set.of("null"));
        property.setAnyOf(java.util.List.of(new Schema<>().$ref(reference), nullSchema));
    }
}
