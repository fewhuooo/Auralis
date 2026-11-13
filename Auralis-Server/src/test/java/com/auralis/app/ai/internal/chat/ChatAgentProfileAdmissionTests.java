package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiMessageCommand;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatAgentProfileAdmissionTests {
    @Mock private ChatRuntimePersistenceService persistence;
    @Mock private AiSettingsService settings;

    private ChatAgentOrchestrator orchestrator;
    private UUID userId;
    private UUID conversationId;
    private UUID runId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        conversationId = UUID.randomUUID();
        runId = UUID.randomUUID();
        orchestrator = new ChatAgentOrchestrator(persistence, null, null, settings,
                null, null, null, null, null, null, null);
    }

    @Test
    void matchingTurnReplayReturnsBeforeResolvingChangedProviderConfiguration() {
        var command = new AiMessageCommand(1, "turn", conversationId, "request-1", "Explain this",
                null, null, null, null, null, null);
        var admission = new ChatRuntimePersistenceService.Admission(null, null, null, true);
        when(persistence.findReplay(userId, command)).thenReturn(admission);

        assertThat(orchestrator.admit(userId, command)).isSameAs(admission);

        verify(settings, never()).resolve(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void newTurnPinsTheCompatibleGenerationProfile() {
        var command = new AiMessageCommand(1, "turn", conversationId, "request-1", "Explain this",
                null, null, null, null, null, null);
        when(settings.resolve(userId, AiProviderType.OPENAI_COMPATIBLE)).thenReturn(
                new AiSettingsService.ResolvedSettings(AiProviderType.OPENAI_COMPATIBLE, "configured-model",
                        new com.auralis.app.ai.AiCredential("https://generation.test/v1", "test-key"),
                        AiCredentialSource.PLATFORM));

        orchestrator.admit(userId, command);

        var profile = org.mockito.ArgumentCaptor.forClass(ChatRuntimePersistenceService.ExecutionProfile.class);
        verify(persistence).admit(org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.eq(command), profile.capture());
        assertThat(profile.getValue().provider()).isEqualTo(AiProviderType.OPENAI_COMPATIBLE);
        assertThat(profile.getValue().chatModel()).isEqualTo("configured-model");
    }

    @Test
    void retryRejectsChangedModelBeforeCreatingAnotherAttempt() {
        var savedProfile = new ChatRuntimePersistenceService.ExecutionProfile(
                AiProviderType.SILICONFLOW, "model-old", "endpoint-hash");
        when(persistence.executionProfile(userId, conversationId, runId)).thenReturn(savedProfile);
        when(settings.resolve(userId, AiProviderType.SILICONFLOW)).thenReturn(
                new AiSettingsService.ResolvedSettings(AiProviderType.SILICONFLOW, "model-new",
                        new com.auralis.app.ai.AiCredential("https://api.example.com/v1", "rotated-key"),
                        AiCredentialSource.PLATFORM));

        Throwable error = org.assertj.core.api.Assertions.catchThrowable(
                () -> orchestrator.admitRetry(userId, conversationId, runId, "retry-1"));
        assertThat(error).isInstanceOf(DomainException.class);
        assertThat(((DomainException) error).code()).isEqualTo("CHAT_PROFILE_CHANGED");

        verify(persistence, never()).retry(userId, conversationId, runId, "retry-1");
    }
}
