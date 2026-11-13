package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.SourceOverviewRequest;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OverviewGeneratedProvenanceRuntimeTests {
    private final UUID userId = UUID.randomUUID();
    private final UUID sourceId = UUID.randomUUID();
    private final UUID revision = UUID.randomUUID();
    private final SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
    private final AiInvocationGateway gateway = mock(AiInvocationGateway.class);
    private final SourceService sources = mock(SourceService.class);
    private final SourceChunkRepository chunks = mock(SourceChunkRepository.class);
    private final AuralisProperties.OverviewLimits limits = mock(AuralisProperties.OverviewLimits.class);

    @ParameterizedTest
    @EnumSource(value = SourceType.class, names = {"TEXT", "URL"})
    void detailedGenerationExplicitlyRejectsNonFileSources(SourceType type) {
        OverviewGenerationService service = service(type);
        assertThatThrownBy(() -> service.preflightSource(userId, request))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("MODEL_UNAVAILABLE"));
        assertThatThrownBy(() -> service.generateSource(userId, request))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("MODEL_UNAVAILABLE"));
        verifyNoInteractions(gateway);
    }

    private OverviewGenerationService service(SourceType type) {
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.overviewResponseTimeoutMillis()).thenReturn(60_000L);
        when(ai.overviewLimits()).thenReturn(limits);
        when(ai.generation()).thenReturn(new AuralisProperties.GenerationEndpoint(
                "https://example.test", "fixture", "key", 1_000_000, 128_000));
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(new SourceView(sourceId, UUID.randomUUID(),
                type, "Fixture", null, null, null, null, SourceIngestionStatus.READY, revision,
                null, null, 0, null, null, null, null));
        AiSettingsService settings = mock(AiSettingsService.class);
        when(settings.resolve(userId, AiProviderType.OPENAI_COMPATIBLE)).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.OPENAI_COMPATIBLE, "fixture", new AiCredential("https://example.test", "test"),
                AiCredentialSource.PLATFORM));
        JsonMapper mapper = JsonMapper.builder().build();
        return new OverviewGenerationService(sources, mock(SubjectService.class), chunks, settings, gateway, properties,
                new OverviewDocumentValidator(mapper, properties), mapper);
    }

    private AiInvocationResult<AiProviderResponse> response(String content) {
        return new AiInvocationResult<>(new AiProviderResponse(content, 200L, 20L, "stop"), null);
    }
}
