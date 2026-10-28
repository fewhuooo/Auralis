package com.auralis.app.ai.diagnostics;

import tools.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

@Configuration(proxyBeanMethods = false)
public class OverviewTraceConfiguration {
    private static final Logger log = LoggerFactory.getLogger(OverviewTraceConfiguration.class);

    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(prefix = "auralis.overview-trace", name = "enabled", havingValue = "true")
    OverviewTrace overviewTrace(ObjectMapper mapper,
            @Value("${auralis.overview-trace.capture-content:false}") boolean content,
            @Value("${auralis.overview-trace.directory:/app/overview-traces}") String configuredDirectory) {
        try {
            return new OverviewTraceFileCollector(Path.of(configuredDirectory), mapper, content);
        } catch (RuntimeException exception) {
            log.warn("Overview trace collector initialization failed; tracing disabled (reason={})",
                    exception.getClass().getSimpleName());
            return OverviewTrace.NOOP;
        }
    }
}
