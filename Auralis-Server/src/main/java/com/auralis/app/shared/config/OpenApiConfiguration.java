package com.auralis.app.shared.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfiguration {
    @Bean
    OpenAPI auralisOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Auralis API")
                        .version("0.1.0")
                        .description("阶段 0 仅提供健康检查和文档；业务路由按绿地重写计划分阶段开放。"));
    }
}
