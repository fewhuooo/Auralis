package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderToolCall;
import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.AiProviderRequestValidator;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public final class AiChatRequestMapper {
    private final ObjectMapper objectMapper;

    public AiChatRequestMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public AiProviderRequest toProviderRequest(ChatRequest request, String model, int maxOutputTokens) {
        List<AiProviderRequest.Message> messages = new ArrayList<>();
        for (ChatMessage message : request.messages()) messages.add(toProviderMessage(message));
        List<AiProviderToolDefinition> tools = request.toolSpecifications().stream()
                .map(this::toProviderTool).toList();
        AiProviderRequest mapped = new AiProviderRequest(model, messages, tools,
                request.temperature(), maxOutputTokens, false, false, 0);
        AiProviderRequestValidator.validate(mapped.messages(), mapped.tools());
        return mapped;
    }

    private AiProviderRequest.Message toProviderMessage(ChatMessage message) {
        return switch (message.type()) {
            case SYSTEM -> new AiProviderRequest.Message(AiMessageRole.SYSTEM,
                    ((SystemMessage) message).text());
            case USER -> {
                UserMessage user = (UserMessage) message;
                if (!user.hasSingleText()) throw invalidMessage();
                yield new AiProviderRequest.Message(AiMessageRole.USER, user.singleText());
            }
            case AI -> {
                AiMessage assistant = (AiMessage) message;
                List<AiProviderToolCall> calls = assistant.toolExecutionRequests().stream()
                        .map(call -> new AiProviderToolCall(call.id(), call.name(), call.arguments())).toList();
                yield new AiProviderRequest.Message(AiMessageRole.ASSISTANT,
                        assistant.text(), calls, null, null);
            }
            case TOOL_EXECUTION_RESULT -> {
                ToolExecutionResultMessage result = (ToolExecutionResultMessage) message;
                if (!result.hasSingleText()) throw invalidMessage();
                yield new AiProviderRequest.Message(AiMessageRole.TOOL, result.text(), List.of(),
                        result.id(), result.toolName());
            }
            default -> throw invalidMessage();
        };
    }

    private AiProviderToolDefinition toProviderTool(ToolSpecification tool) {
        try {
            JsonNode specification = objectMapper.reader()
                    .with(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(tool.toJson());
            JsonNode parameters = specification.path("parameters");
            if (!parameters.isObject()) throw invalidMessage();
            return new AiProviderToolDefinition(tool.name(), tool.description(),
                    objectMapper.writeValueAsString(parameters));
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("LangChain4j tool schema is invalid", exception);
        }
    }

    public ToolSpecification toSdkTool(AiProviderToolDefinition tool) {
        try {
            JsonNode parameters = AiProviderRequestValidator.requireObject(tool.schemaJson());
            Map<String, Object> spec = new LinkedHashMap<>();
            spec.put("name", tool.name());
            spec.put("description", tool.description());
            spec.put("parameters", parameters);
            // SDK owns its stable core/Jackson2 codec; the application only passes a JSON string.
            return ToolSpecification.fromJson(objectMapper.writeValueAsString(spec));
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("Tool schema cannot be mapped to LangChain4j", exception);
        }
    }

    private IllegalArgumentException invalidMessage() {
        return new IllegalArgumentException("LangChain4j request contains an unsupported chat message");
    }
}
