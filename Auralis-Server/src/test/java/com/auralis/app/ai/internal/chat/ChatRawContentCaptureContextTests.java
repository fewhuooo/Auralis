package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatRawContentCaptureContextTests {
    @Test
    void componentAndOrchestratorAreCreatedWithConfiguredCaptureDependency() {
        new ApplicationContextRunner()
                .withUserConfiguration(ChatComponentConfiguration.class, TestDependencies.class)
                .withPropertyValues(
                        "auralis.ai.chat-agent.raw-content-capture-enabled=false",
                        "auralis.ai.chat-agent.raw-content-capture-directory=/tmp/auralis-test-capture")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(ChatRawContentCapture.class);
                    assertThat(context).hasSingleBean(ChatAgentOrchestrator.class);
                    assertThat(context.getBean(ChatAgentOrchestrator.class)).isNotNull();
                });
    }

    @Configuration(proxyBeanMethods = false)
    @ComponentScan(
            basePackageClasses = ChatAgentOrchestrator.class,
            useDefaultFilters = false,
            includeFilters = @ComponentScan.Filter(
                    type = FilterType.ASSIGNABLE_TYPE,
                    classes = {ChatRawContentCapture.class, ChatAgentOrchestrator.class}))
    static class ChatComponentConfiguration {
    }

    @Configuration(proxyBeanMethods = false)
    static class TestDependencies {
        @Bean
        ChatRuntimePersistenceService chatRuntimePersistenceService() {
            return mock(ChatRuntimePersistenceService.class);
        }

        @Bean
        ConversationService conversationService() {
            return mock(ConversationService.class);
        }

        @Bean
        MessageRepository messageRepository() {
            return mock(MessageRepository.class);
        }

        @Bean
        AiSettingsService aiSettingsService() {
            return mock(AiSettingsService.class);
        }

        @Bean
        AiInvocationGateway aiInvocationGateway() {
            return mock(AiInvocationGateway.class);
        }

        @Bean
        ChatAgentModelAdapterFactory chatAgentModelAdapterFactory() {
            return mock(ChatAgentModelAdapterFactory.class);
        }

        @Bean
        ChatAgentProperties chatAgentProperties() {
            return ChatAgentProperties.defaults();
        }

        @Bean
        ChatReadTools chatReadTools() {
            return mock(ChatReadTools.class);
        }

        @Bean
        AiUsageQueryService aiUsageQueryService() {
            return mock(AiUsageQueryService.class);
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        AuralisProperties auralisProperties() {
            AuralisProperties properties = mock(AuralisProperties.class);
            AuralisProperties.Ai aiProperties = mock(AuralisProperties.Ai.class);
            when(properties.ai()).thenReturn(aiProperties);
            when(aiProperties.providerMaxResponseBytes()).thenReturn(1_048_576L);
            return properties;
        }
    }
}
