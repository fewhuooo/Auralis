package com.auralis.app.ai.diagnostics;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class OverviewTraceConfigurationTests {
    @Test
    void bindsUppercaseContainerEnvironmentVariablesToOptInCollector() throws Exception {
        Path directory = Path.of("D:/Temp/auralis-overview-trace-20261023/config-env")
                .resolve(UUID.randomUUID().toString());
        UUID owner = UUID.randomUUID();
        try (AnnotationConfigApplicationContext context = context(Map.of(
                "AURALIS_OVERVIEW_TRACE_ENABLED", "true",
                "AURALIS_OVERVIEW_TRACE_CAPTURE_CONTENT", "true",
                "AURALIS_OVERVIEW_TRACE_DIRECTORY", directory.toString()))) {
            OverviewTrace trace = context.getBean(OverviewTrace.class);
            assertThat(trace).isInstanceOf(OverviewTraceFileCollector.class);
            assertThat(trace.capturesContent()).isTrue();

            OverviewTraceRun run = trace.start(owner, UUID.randomUUID(), null, null);
            run.event("CONFIG_TEST", "CONFIG", null, "READY", Map.of(), Map.of("content", "enabled"));
            run.finish("SUCCESS", null, Map.of());
            Path summary = directory.resolve(owner.toString()).resolve(run.runId().toString()).resolve("summary.json");
            Instant deadline = Instant.now().plus(Duration.ofSeconds(3));
            while (!Files.exists(summary) && Instant.now().isBefore(deadline)) Thread.sleep(20);
            assertThat(summary).exists();
        }
    }

    @Test
    void invalidConfiguredPathFallsBackToNoopWithoutStartingWriterOrCreatingFiles() {
        long writersBefore = traceWriterCount();
        try (AnnotationConfigApplicationContext context = context(Map.of(
                "AURALIS_OVERVIEW_TRACE_ENABLED", "true",
                "AURALIS_OVERVIEW_TRACE_CAPTURE_CONTENT", "true",
                "AURALIS_OVERVIEW_TRACE_DIRECTORY", "\u0000"))) {
            assertThat(context.getBean(OverviewTrace.class)).isSameAs(OverviewTrace.NOOP);
        }
        assertThat(traceWriterCount()).isEqualTo(writersBefore);
    }

    private AnnotationConfigApplicationContext context(Map<String, Object> environment) {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        context.getEnvironment().getPropertySources().addFirst(
                new SystemEnvironmentPropertySource("test-container-environment", environment));
        context.getBeanFactory().registerSingleton("objectMapper", new ObjectMapper());
        context.register(OverviewTraceConfiguration.class);
        context.refresh();
        return context;
    }

    private long traceWriterCount() {
        return Thread.getAllStackTraces().keySet().stream()
                .filter(thread -> thread.getName().equals("overview-trace-file-writer"))
                .count();
    }
}
