package com.auralis.app;

import com.auralis.app.ai.AiProviderDiscoveryService;
import com.auralis.app.ai.AiStreamingService;
import com.auralis.app.ai.OverviewGenerationService;
import com.auralis.app.ai.ingestion.IngestionWorker;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.EmbeddingProviderPort;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ArchitectureTests {
    @Test
    void verifiesApplicationModules() {
        ApplicationModules.of(AuralisApplication.class).verify();
    }

    @Test
    void providerCallingBusinessAdaptersCannotInjectProviderRegistriesOrPorts() {
        List<Class<?>> adapters = List.of(AiStreamingService.class, OverviewGenerationService.class,
                AiProviderDiscoveryService.class, IngestionWorker.class);
        List<Class<?>> forbidden = List.of(AiProviderRegistry.class, EmbeddingProviderRegistry.class,
                AiProviderPort.class, EmbeddingProviderPort.class);

        for (Class<?> adapter : adapters) {
            for (var field : adapter.getDeclaredFields()) {
                assertThat(forbidden).as("field %s of %s", field.getName(), adapter.getName())
                        .doesNotContain(field.getType());
            }
            for (var constructor : adapter.getDeclaredConstructors()) {
                for (Class<?> parameterType : constructor.getParameterTypes()) {
                    assertThat(forbidden).as("constructor parameter of %s", adapter.getName())
                            .doesNotContain(parameterType);
                }
            }
        }
    }
}
