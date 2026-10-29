package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public final class ChatAgentModelAdapterFactory {
    private final AiChatRequestMapper mapper;
    private final ChatAgentProperties chatAgent;
    private final int maxOutputTokens;
    private final long responseTimeoutMillis;

    public ChatAgentModelAdapterFactory(AiChatRequestMapper mapper, ChatAgentProperties chatAgent,
                                       AuralisProperties properties) {
        this.mapper = Objects.requireNonNull(mapper);
        this.chatAgent = Objects.requireNonNull(chatAgent);
        this.maxOutputTokens = properties.ai().limits().chatMaxOutputTokens();
        this.responseTimeoutMillis = properties.ai().requestTimeoutMillis();
    }

    public ChatAgentModelAdapter create(ChatAgentRunContext context, AiTaskScope scope) {
        return new ChatAgentModelAdapter(context, scope, mapper, chatAgent, maxOutputTokens, responseTimeoutMillis);
    }
}
