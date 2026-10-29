package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.ChatRunStatusView;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class ChatEvidenceHistoryProjectorTests {
    private static final String TOOL = "search";
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiChatRequestMapper mapper = new AiChatRequestMapper(objectMapper);
    private final ChatEvidenceHistoryProjector projector = new ChatEvidenceHistoryProjector(objectMapper);

    @Test
    void persistsAndProjectsExactEvidenceWithPairedCallsAndBudgetAwareOlderFolding() throws Exception {
        ChatPrivateToolEvidenceCodec codec = new ChatPrivateToolEvidenceCodec(objectMapper);
        ChatToolEvidence oldEvidence = evidence("iteration-old", 0, 0, "call-old",
                "old query anchor", "older evidence excerpt ".repeat(100), "old-source", "old-revision");
        ChatToolEvidence recentEvidence = evidence("iteration-recent", 0, 0, "call-recent",
                "recent query", "recent complete excerpt", "recent-source", "recent-revision");
        ChatToolEvidence secondRecentEvidence = evidence("iteration-recent", 0, 1, "call-recent-2",
                "second recent query", "second complete excerpt", "recent-source-2", "recent-revision-2");
        String persisted = codec.append("[]", oldEvidence);
        persisted = codec.append(persisted, recentEvidence);
        persisted = codec.append(persisted, secondRecentEvidence);
        assertThat(codec.decode(persisted)).containsExactly(oldEvidence, recentEvidence, secondRecentEvidence);

        ChatEvidenceHistoryProjector.HistoryTurn older = new ChatEvidenceHistoryProjector.HistoryTurn(
                List.of(UserMessage.from("older question"), UserMessage.from("older public reply")),
                List.of(oldEvidence));
        ChatEvidenceHistoryProjector.HistoryTurn latest = new ChatEvidenceHistoryProjector.HistoryTurn(
                List.of(UserMessage.from("latest question"), UserMessage.from("latest public reply")),
                List.of(recentEvidence, secondRecentEvidence));
        List<ChatMessage> required = List.of(UserMessage.from("current system and user context"));
        List<ChatMessage> currentIteration = List.of(UserMessage.from("current iteration evidence stays full"));
        ToolSpecification definition = ToolSpecification.builder().name(TOOL).description("search")
                .parameters(JsonObjectSchema.builder().build()).build();
        AtomicLong smallestMappedRequestWithRealOldExcerpt = new AtomicLong(Long.MAX_VALUE);
        Predicate<List<ChatMessage>> tightCapacity = messages -> {
            long bytes = serializedBytes(messages, definition);
            boolean oldTurn = messages.contains(UserMessage.from("older question"));
            boolean hasOldExcerpt = messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                    .map(ToolExecutionResultMessage.class::cast)
                    .anyMatch(result -> result.id().equals("call-old") && result.text().contains("older evidence excerpt "));
            if (oldTurn && hasOldExcerpt) smallestMappedRequestWithRealOldExcerpt.accumulateAndGet(bytes, Math::min);
            return bytes <= 2_000;
        };
        // Measure the real mapped request boundary first; the 2 KB probe demonstrates the oldest
        // turn must be removed under that cap. Then select the smallest measured request that
        // retains a genuine excerpt and verify deterministic folding at that exact byte budget.
        ChatEvidenceHistoryProjector.Projection tooTight = projector.project(required,
                List.of(older, latest), currentIteration, tightCapacity);
        assertThat(tooTight.fits()).isTrue();
        assertThat(tooTight.messages()).doesNotContain(UserMessage.from("older question"))
                .contains(UserMessage.from("latest question"));
        long foldedCapacityBytes = smallestMappedRequestWithRealOldExcerpt.get();
        assertThat(foldedCapacityBytes).isLessThan(Long.MAX_VALUE);
        Predicate<List<ChatMessage>> fitsFoldedBoundary = messages -> serializedBytes(messages, definition) <= foldedCapacityBytes;
        ChatEvidenceHistoryProjector.Projection projection = projector.project(required,
                List.of(older, latest), currentIteration, fitsFoldedBoundary);

        assertThat(projection.fits()).isTrue();
        assertThat(projection.messages()).containsAll(required).containsAll(currentIteration);
        assertThat(projection.messages()).contains(UserMessage.from("latest question"));
        assertThat(projection.messages()).contains(UserMessage.from("older question"));

        AiProviderRequest mapped = map(projection.messages(), definition);
        assertThat(mapped.tools()).hasSize(1);
        List<AiProviderRequest.Message> messages = mapped.messages();
        int recentCallIndex = indexOfCall(messages, "call-recent");
        assertThat(recentCallIndex).isGreaterThanOrEqualTo(0);
        AiProviderRequest.Message assistant = messages.get(recentCallIndex);
        assertThat(assistant.role()).isEqualTo(AiMessageRole.ASSISTANT);
        assertThat(assistant.toolCalls()).extracting("id").containsExactly("call-recent", "call-recent-2");
        AiProviderRequest.Message pairedResult = messages.get(recentCallIndex + 1);
        assertThat(pairedResult.role()).isEqualTo(AiMessageRole.TOOL);
        assertThat(pairedResult.toolCallId()).isEqualTo("call-recent");
        assertThat(pairedResult.content()).contains("recent complete excerpt", "recent-revision");
        assertThat(messages.get(recentCallIndex + 2).toolCallId()).isEqualTo("call-recent-2");
        assertThat(messages.get(recentCallIndex + 2).content()).contains("second complete excerpt");
        int oldCallIndex = indexOfCall(messages, "call-old");
        assertThat(oldCallIndex).isGreaterThanOrEqualTo(0);
        AiProviderRequest.Message oldResult = messages.get(oldCallIndex + 1);
        assertThat(oldResult.role()).isEqualTo(AiMessageRole.TOOL);
        assertThat(oldResult.toolCallId()).isEqualTo("call-old");
        assertThat(oldResult.content()).contains("\"folded\":true", "old-source", "old-revision");
        assertThat(messages.get(oldCallIndex).toolCalls().getFirst().argumentsJson()).contains("old query anchor");
        assertThat(oldResult.content()).doesNotContain(oldEvidence.resultJson());
        assertThat(serializedBytes(projection.messages(), definition)).isLessThanOrEqualTo(foldedCapacityBytes);
    }

    @Test
    void keepsCurrentIterationToolResultAndNeverMixesPrivateEvidenceIntoPublicParts() {
        ChatToolEvidence currentEvidence = evidence("iteration-current", 0, 0, "call-current",
                "secret query anchor", "secret source excerpt", "private-source", "private-revision");
        List<ChatMessage> currentMessages = toolExchange(currentEvidence);
        ChatEvidenceHistoryProjector.Projection projection = projector.project(
                List.of(UserMessage.from("required")), List.of(), currentMessages, ignored -> true);

        AiMessage call = (AiMessage) projection.messages().get(1);
        ToolExecutionResultMessage result = (ToolExecutionResultMessage) projection.messages().get(2);
        assertThat(call.toolExecutionRequests()).extracting(request -> request.id()).containsExactly("call-current");
        assertThat(result.id()).isEqualTo("call-current");
        assertThat(result.text()).contains("secret source excerpt");

        String publicPart = ChatPublicProjection.markdown(List.of(Map.of("kind", "text", "text", "public reply")));
        assertThat(publicPart).doesNotContain("secret query anchor", "secret source excerpt", "private-source");
        // Public tool capsules are intentionally separate records; evidence has no public trace projection.
        ChatRunStatusView publicRun = new ChatRunStatusView(1, UUID.randomUUID(), UUID.randomUUID(), "request",
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "RUNNING", 1, true, Map.of(), List.of(),
                List.of(Map.of("id", "call-current", "name", TOOL, "status", "completed")),
                null, null, List.of());
        String publicSnapshot = objectMapper.writeValueAsString(publicRun);
        assertThat(publicSnapshot).contains("call-current", "completed")
                .doesNotContain("secret query anchor", "secret source excerpt", "private-source", "private-revision");
    }

    @Test
    void removesOldTurnsInStableOrderWhenFoldedEvidenceStillExceedsCapacity() {
        var oldest = new ChatEvidenceHistoryProjector.HistoryTurn(List.of(UserMessage.from("oldest")), List.of());
        var middle = new ChatEvidenceHistoryProjector.HistoryTurn(List.of(UserMessage.from("middle")), List.of());
        var latest = new ChatEvidenceHistoryProjector.HistoryTurn(List.of(UserMessage.from("latest")), List.of());
        var result = projector.project(List.of(UserMessage.from("fixed")), List.of(oldest, middle, latest),
                List.of(UserMessage.from("current")), messages -> messages.size() <= 3);

        assertThat(result.fits()).isTrue();
        assertThat(result.messages()).containsExactly(UserMessage.from("fixed"), UserMessage.from("latest"),
                UserMessage.from("current"));
    }

    private List<ChatMessage> toolExchange(ChatToolEvidence evidence) {
        ToolExecutionRequest request = ToolExecutionRequest.builder().id(evidence.toolCallId())
                .name(evidence.toolName()).arguments(evidence.argumentsJson()).build();
        return List.of(AiMessage.from(List.of(request)), ToolExecutionResultMessage.from(
                evidence.toolCallId(), evidence.toolName(), evidence.resultJson()));
    }

    private long serializedBytes(List<ChatMessage> messages, ToolSpecification definition) {
        try {
            return objectMapper.writeValueAsBytes(map(messages, definition)).length;
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private AiProviderRequest map(List<ChatMessage> messages, ToolSpecification definition) {
        return mapper.toProviderRequest(ChatRequest.builder().modelName("test-model")
                .messages(messages).toolSpecifications(definition).build(), "test-model", 256);
    }

    private int indexOfCall(List<AiProviderRequest.Message> messages, String id) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i).role() == AiMessageRole.ASSISTANT
                    && messages.get(i).toolCalls().stream().anyMatch(call -> call.id().equals(id))) return i;
        }
        return -1;
    }

    private ChatToolEvidence evidence(String iteration, int iterationOrder, int callOrder, String callId,
            String query, String excerpt, String sourceId, String revision) {
        String args = "{\"query\":\"" + query + "\"}";
        String result = "{\"evidence\":[{\"sourceId\":\"" + sourceId + "\",\"chunkId\":\"chunk-1\","
                + "\"ordinal\":7,\"title\":\"Study\",\"excerpt\":\"" + excerpt + "\"}]}";
        return new ChatToolEvidence(iteration, iterationOrder, callOrder, callId, TOOL, args, result,
                "COMPLETED", List.of(new ChatToolEvidence.SourceRevision(sourceId, revision)));
    }
}
