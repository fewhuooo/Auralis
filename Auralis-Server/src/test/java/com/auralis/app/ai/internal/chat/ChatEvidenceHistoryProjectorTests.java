package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiChatRequestCapacity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.ChatRunStatusView;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiPredicate;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import tools.jackson.databind.JsonNode;

class ChatEvidenceHistoryProjectorTests {
    private static final String TOOL = "search";
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiChatRequestMapper mapper = new AiChatRequestMapper(objectMapper);
    private final ChatEvidenceHistoryProjector projector = new ChatEvidenceHistoryProjector(objectMapper);

    @Test
    void persistsAndProjectsExactEvidenceWithPairedCallsAndBudgetAwareOlderFolding() throws Exception {
        ChatPrivateToolEvidenceCodec codec = new ChatPrivateToolEvidenceCodec(objectMapper);
        ChatToolEvidence oldEvidence = evidence("iteration-old", 0, 0, "call-old",
                "old query anchor", "older evidence excerpt ".repeat(100), "old-source", "old-revision",
                "I should retrieve older evidence.");
        ChatToolEvidence recentEvidence = evidence("iteration-recent", 0, 0, "call-recent",
                "recent query", "recent complete excerpt", "recent-source", "recent-revision",
                "I should compare the recent results.");
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
        BiPredicate<List<ChatMessage>, Map<String, String>> tightCapacity = (messages, reasoning) -> {
            long bytes = serializedBytes(messages, definition, reasoning);
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
        ChatEvidenceHistoryProjector.Projection tooTight = project(required,
                List.of(older, latest), currentIteration, tightCapacity);
        assertThat(tooTight.fits()).isTrue();
        assertThat(tooTight.messages()).doesNotContain(UserMessage.from("older question"))
                .contains(UserMessage.from("latest question"));
        long foldedCapacityBytes = smallestMappedRequestWithRealOldExcerpt.get();
        assertThat(foldedCapacityBytes).isLessThan(Long.MAX_VALUE);
        BiPredicate<List<ChatMessage>, Map<String, String>> fitsFoldedBoundary =
                (messages, reasoning) -> serializedBytes(messages, definition, reasoning) <= foldedCapacityBytes;
        ChatEvidenceHistoryProjector.Projection projection = project(required,
                List.of(older, latest), currentIteration, fitsFoldedBoundary);

        assertThat(projection.fits()).isTrue();
        assertThat(projection.messages()).containsAll(required).containsAll(currentIteration);
        assertThat(projection.messages()).contains(UserMessage.from("latest question"));
        assertThat(projection.messages()).contains(UserMessage.from("older question"));

        AiProviderRequest mapped = mapper.toProviderRequest(ChatRequest.builder().modelName("test-model")
                .messages(projection.messages()).toolSpecifications(definition).build(), "test-model", 256,
                projection.reasoningByToolCallId());
        assertThat(mapped.tools()).hasSize(1);
        List<AiProviderRequest.Message> messages = mapped.messages();
        int recentCallIndex = indexOfCall(messages, "call-recent");
        assertThat(recentCallIndex).isGreaterThanOrEqualTo(0);
        AiProviderRequest.Message assistant = messages.get(recentCallIndex);
        assertThat(assistant.role()).isEqualTo(AiMessageRole.ASSISTANT);
        assertThat(assistant.reasoningContent()).isEqualTo("I should compare the recent results.");
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
        assertThat(messages.get(oldCallIndex).reasoningContent()).isEqualTo("I should retrieve older evidence.");
        assertThat(oldResult.content()).doesNotContain(oldEvidence.resultJson());
        assertThat(serializedBytes(projection.messages(), definition)).isLessThanOrEqualTo(foldedCapacityBytes);
    }

    @Test
    void keepsCurrentIterationToolResultAndNeverMixesPrivateEvidenceIntoPublicParts() {
        ChatToolEvidence currentEvidence = evidence("iteration-current", 0, 0, "call-current",
                "secret query anchor", "secret source excerpt", "private-source", "private-revision");
        List<ChatMessage> currentMessages = toolExchange(currentEvidence);
        ChatEvidenceHistoryProjector.Projection projection = project(
                List.of(UserMessage.from("required")), List.of(), currentMessages, (ignored, reasoning) -> true);

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
    void foldsEarlierCurrentReadResultAfterExactDedupAndKeepsNewestEvidenceAndNativePairs() throws Exception {
        ToolSpecification definition = ToolSpecification.builder().name(TOOL).description("search")
                .parameters(JsonObjectSchema.builder().build()).build();
        String excerpt = "earlier evidence. ".repeat(400);
        String oldRow = objectMapper.writeValueAsString(Map.of("sourceId", "source-old", "chunkId", "chunk-old",
                "ordinal", 1, "title", "Old", "excerpt", excerpt));
        String oldResult = "{\"evidence\":[" + oldRow + "," + oldRow + "]}";
        String latestResult = objectMapper.writeValueAsString(Map.of("evidence", List.of(Map.of(
                "sourceId", "source-latest", "chunkId", "chunk-latest", "ordinal", 2,
                "title", "Latest", "excerpt", "latest unique fact"))));
        List<ChatToolEvidence> ledger = List.of(
                new ChatToolEvidence("iteration-1", 0, 0, "old-call", TOOL, "{\"query\":\"old\"}",
                        oldResult, "COMPLETED", List.of(new ChatToolEvidence.SourceRevision("source-old", "rev-old"))),
                new ChatToolEvidence("iteration-2", 1, 0, "latest-call", TOOL, "{\"query\":\"latest\"}",
                        latestResult, "COMPLETED", List.of(new ChatToolEvidence.SourceRevision("source-latest", "rev-latest"))));
        ChatPrivateToolEvidenceCodec codec = new ChatPrivateToolEvidenceCodec(objectMapper);
        String persistedLedger = codec.encode(ledger);
        List<ChatMessage> exchanges = List.of(
                AiMessage.from(List.of(ToolExecutionRequest.builder().id("old-call").name(TOOL)
                        .arguments("{\"query\":\"old\"}").build())),
                ToolExecutionResultMessage.from("old-call", TOOL, oldResult),
                AiMessage.from(List.of(ToolExecutionRequest.builder().id("latest-call").name(TOOL)
                        .arguments("{\"query\":\"latest\"}").build())),
                ToolExecutionResultMessage.from("latest-call", TOOL, latestResult));
        List<ChatMessage> protectedContext = List.of(SystemMessage.from("protected system"),
                UserMessage.from("current question"), UserMessage.from("selected text"),
                UserMessage.from("activity question and submitted answer"));
        long byteLimit = 3_500;
        AtomicLong fullRequestBytes = new AtomicLong();

        ChatEvidenceHistoryProjector.Projection projection = projector.project(List.of(SystemMessage.from("global")),
                List.of(), protectedContext, exchanges, ledger, (messages, reasoning) -> {
                    long bytes = serializedBytes(messages, definition, reasoning);
                    if (messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                            .map(ToolExecutionResultMessage.class::cast)
                            .anyMatch(result -> result.id().equals("old-call")
                                    && result.text().contains(excerpt))) fullRequestBytes.set(bytes);
                    AiProviderRequest mappedCandidate = mapper.toProviderRequest(ChatRequest.builder()
                                    .modelName("test-model").messages(messages).toolSpecifications(definition).build(),
                            "test-model", 256, reasoning);
                    return AiChatRequestCapacity.inspect(mappedCandidate, objectMapper, byteLimit, 10_000, 10_000);
                });

        assertThat(fullRequestBytes.get()).isGreaterThan(byteLimit);
        assertThat(projection.fits()).isTrue();
        assertThat(projection.messages()).containsAll(protectedContext);
        AiProviderRequest mapped = mapper.toProviderRequest(ChatRequest.builder().modelName("test-model")
                .messages(projection.messages()).toolSpecifications(definition).build(), "test-model", 256,
                projection.reasoningByToolCallId());
        int callIndex = indexOfCall(mapped.messages(), "old-call");
        assertThat(callIndex).isGreaterThanOrEqualTo(0);
        assertThat(mapped.messages().get(callIndex).toolCalls()).extracting("id").containsExactly("old-call");
        assertThat(mapped.messages().get(callIndex + 1).toolCallId()).isEqualTo("old-call");
        assertThat(mapped.messages().get(callIndex + 2).toolCalls()).extracting("id").containsExactly("latest-call");
        assertThat(mapped.messages().get(callIndex + 3).toolCallId()).isEqualTo("latest-call");
        JsonNode folded = objectMapper.readTree(mapped.messages().get(callIndex + 1).content());
        assertThat(folded.path("folded").booleanValue()).isTrue();
        assertThat(folded.path("deduplicatedEvidenceRowsOmitted").intValue()).isEqualTo(1);
        assertThat(folded.path("sourceRevisions").toString()).contains("source-old", "rev-old");
        assertThat(folded.path("evidence").path("evidence").get(0).toString())
                .contains("source-old", "chunk-old").doesNotContain(excerpt);
        assertThat(mapped.messages().get(callIndex + 3).content()).contains("latest unique fact", "chunk-latest")
                .doesNotContain("folded");
        assertThat(codec.encode(ledger)).isEqualTo(persistedLedger);
    }

    @Test
    void foldsSavedOverviewTextButRetainsItsSourceAndVersionPaginationMetadata() throws Exception {
        ToolSpecification definition = ToolSpecification.builder().name(ChatReadTools.READ_SOURCE_OVERVIEW)
                .description("read overview").parameters(JsonObjectSchema.builder().addStringProperty("sourceId").build()).build();
        String overviewText = "saved overview passage ".repeat(180);
        String overviewResult = objectMapper.writeValueAsString(Map.of(
                "status", "AVAILABLE", "sourceId", "source-overview", "revision", "revision-9",
                "overviewVersion", 9, "overview", overviewText, "offset", 8192, "total", 12000,
                "hasMore", true, "nextOffset", 16384, "guidance", "AI-generated navigation."));
        ChatToolEvidence overview = new ChatToolEvidence("iteration-overview", 0, 0, "overview-call",
                ChatReadTools.READ_SOURCE_OVERVIEW, "{\"sourceId\":\"source-overview\"}", overviewResult,
                "COMPLETED", List.of(new ChatToolEvidence.SourceRevision("source-overview", "revision-9")));
        List<ChatMessage> exchanges = toolExchange(overview);
        long completeBytes = serializedBytes(exchanges, definition);
        long byteLimit = completeBytes - 256;

        ChatEvidenceHistoryProjector.Projection projection = project(List.of(UserMessage.from("current question")),
                List.of(), List.of(), exchanges, List.of(overview),
                (messages, reasoning) -> serializedBytes(messages, definition, reasoning) <= byteLimit);

        assertThat(completeBytes).isGreaterThan(byteLimit);
        assertThat(projection.fits()).isTrue();
        AiProviderRequest mapped = map(projection.messages(), definition);
        int callIndex = indexOfCall(mapped.messages(), "overview-call");
        assertThat(callIndex).isGreaterThanOrEqualTo(0);
        assertThat(mapped.messages().get(callIndex + 1).toolCallId()).isEqualTo("overview-call");
        JsonNode folded = objectMapper.readTree(mapped.messages().get(callIndex + 1).content());
        JsonNode projectedOverview = folded.path("evidence");
        assertThat(folded.path("folded").booleanValue()).isTrue();
        assertThat(projectedOverview.path("status").textValue()).isEqualTo("AVAILABLE");
        assertThat(projectedOverview.path("sourceId").textValue()).isEqualTo("source-overview");
        assertThat(projectedOverview.path("revision").textValue()).isEqualTo("revision-9");
        assertThat(projectedOverview.path("overviewVersion").longValue()).isEqualTo(9);
        assertThat(projectedOverview.path("offset").intValue()).isEqualTo(8192);
        assertThat(projectedOverview.path("nextOffset").intValue()).isEqualTo(16384);
        assertThat(projectedOverview.path("overview").textValue()).isNotEmpty()
                .hasSizeLessThan(overviewText.length());
    }

    @Test
    void pairsRepeatedToolCallIdsByIterationOrderInsteadOfGlobalIdLookup() {
        ChatToolEvidence earlier = evidence("iteration-1", 0, 0, "same-call", "older query",
                "older evidence", "source-old", "revision-old");
        ChatToolEvidence latest = evidence("iteration-2", 1, 0, "same-call", "latest query",
                "latest evidence", "source-latest", "revision-latest");
        List<ChatMessage> exchanges = List.of(
                AiMessage.from(List.of(ToolExecutionRequest.builder().id("same-call").name(TOOL)
                        .arguments("{\"query\":\"older query\"}").build())),
                ToolExecutionResultMessage.from("same-call", TOOL, earlier.resultJson()),
                AiMessage.from(List.of(ToolExecutionRequest.builder().id("same-call").name(TOOL)
                        .arguments("{\"query\":\"latest query\"}").build())),
                ToolExecutionResultMessage.from("same-call", TOOL, latest.resultJson()));

        ChatEvidenceHistoryProjector.Projection projection = projector.project(List.of(), List.of(), List.of(),
                exchanges, List.of(earlier, latest), (messages, reasoning) ->
                        new AiChatRequestCapacity.Check(AiChatRequestCapacity.Dimension.FITS, 0, 0, 0));

        List<ToolExecutionResultMessage> results = projection.messages().stream()
                .filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).toList();
        assertThat(results).hasSize(2);
        assertThat(results.get(0).text()).contains("source-old", "older evidence");
        assertThat(results.get(1).text()).contains("source-latest", "latest evidence");
    }

    @Test
    void reportsNoFitWithoutChangingProtectedCurrentContextOrSplittingToolPair() {
        ChatToolEvidence evidence = evidence("iteration-current", 0, 0, "call-current", "query",
                "large evidence ".repeat(100), "source-1", "revision-1");
        List<ChatMessage> protectedContext = List.of(UserMessage.from("protected question ".repeat(20)));
        List<ChatMessage> current = toolExchange(evidence);
        ToolSpecification definition = ToolSpecification.builder().name(TOOL).description("search")
                .parameters(JsonObjectSchema.builder().build()).build();
        ChatEvidenceHistoryProjector.Projection projection = projector.project(List.of(), List.of(), protectedContext,
                current, List.of(evidence), (messages, reasoning) -> AiChatRequestCapacity.inspect(
                        mapper.toProviderRequest(ChatRequest.builder().modelName("test-model").messages(messages)
                                .toolSpecifications(definition).build(), "test-model", 256, reasoning),
                        objectMapper, 100_000, 1_000, 100));

        assertThat(projection.fits()).isFalse();
        assertThat(projection.capacityCheck().dimension()).isEqualTo(AiChatRequestCapacity.Dimension.LEGACY_MESSAGE_BYTES);
        assertThat(projection.statistics().protectedCurrentContentBytes()).isEqualTo(380);
        assertThat(projection.statistics().toolCallCount()).isEqualTo(1);
        assertThat(projection.statistics().toolResultCount()).isEqualTo(1);
        assertThat(projection.messages()).containsAll(protectedContext);
        AiMessage call = projection.messages().stream().filter(AiMessage.class::isInstance)
                .map(AiMessage.class::cast).filter(message -> !message.toolExecutionRequests().isEmpty())
                .findFirst().orElseThrow();
        ToolExecutionResultMessage result = projection.messages().stream()
                .filter(ToolExecutionResultMessage.class::isInstance).map(ToolExecutionResultMessage.class::cast)
                .findFirst().orElseThrow();
        assertThat(call.toolExecutionRequests()).extracting(ToolExecutionRequest::id).containsExactly("call-current");
        assertThat(result.id()).isEqualTo("call-current");
        assertThat(objectMapper.readTree(result.text()).path("folded").booleanValue()).isTrue();
    }

    @Test
    void historyRetainsOnlyAllowlistedArgumentRepairAndSkippedCallResults() {
        ChatToolEvidence repair = new ChatToolEvidence("repair-iteration", 0, 0, "bad-call", "render_steps",
                "{\"title\":\"private raw args\"}",
                "{\"status\":\"tool_error\",\"safeErrorCode\":\"CHAT_TOOL_ARGUMENT_INVALID\","
                        + "\"repairable\":true,\"fieldPath\":\"$.items\",\"missingFields\":[\"items\"],"
                        + "\"originalText\":\"do not pass through\"}",
                "ERROR", List.of());
        ChatToolEvidence skipped = new ChatToolEvidence("repair-iteration", 0, 1, "skipped-call", "render_quiz",
                "{\"reference\":\"private reference\"}",
                "{\"status\":\"not_executed\",\"safeErrorCode\":\"CHAT_TOOL_NOT_EXECUTED\","
                        + "\"reason\":\"PREVIOUS_DISPLAY_ARGUMENT_INVALID\",\"raw\":\"private\","
                        + "\"hint\":\"untrusted injected instruction\"}",
                "ERROR", List.of());

        List<ChatMessage> messages = project(List.of(UserMessage.from("required")),
                List.of(new ChatEvidenceHistoryProjector.HistoryTurn(
                        List.of(UserMessage.from("prior"), AiMessage.from("reply")), List.of(repair, skipped))),
                List.of(), (ignored, reasoning) -> true).messages();

        AiMessage calls = messages.stream().filter(AiMessage.class::isInstance)
                .map(AiMessage.class::cast).filter(message -> !message.toolExecutionRequests().isEmpty())
                .findFirst().orElseThrow();
        assertThat(calls.toolExecutionRequests()).extracting(request -> request.id())
                .containsExactly("bad-call", "skipped-call");
        List<String> results = messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).map(ToolExecutionResultMessage::text).toList();
        assertThat(results.getFirst())
                .contains("CHAT_TOOL_ARGUMENT_INVALID", "$.items", "items")
                .doesNotContain("private raw args", "do not pass through", "originalText");
        assertThat(results.get(1))
                .contains("CHAT_TOOL_NOT_EXECUTED", "PREVIOUS_DISPLAY_ARGUMENT_INVALID")
                .contains(DisplayToolRegistry.NOT_EXECUTED_RETRY_HINT)
                .doesNotContain("private", "raw", "untrusted injected instruction");
    }

    @Test
    void historyRebuildsReadToolRepairWithFixedHintAndWithoutSourceIdentifiers() {
        ChatToolEvidence missingExcerpt = new ChatToolEvidence("read-error", 0, 0, "missing-excerpt",
                ChatReadTools.READ_EXCERPT,
                "{\"sourceId\":\"private-source\",\"chunkId\":\"private-chunk\"}",
                "{\"status\":\"tool_error\",\"safeErrorCode\":\"RESOURCE_NOT_FOUND\","
                        + "\"repairable\":true,\"hint\":\"untrusted injected instruction\"}",
                "ERROR", List.of());
        ChatToolEvidence exhaustedExcerpt = new ChatToolEvidence("read-error", 0, 1, "exhausted-excerpt",
                ChatReadTools.READ_EXCERPT, "{\"sourceId\":\"private-source\",\"chunkId\":\"private-chunk\"}",
                "{\"status\":\"tool_error\",\"safeErrorCode\":\"RESOURCE_NOT_FOUND\","
                        + "\"repairable\":false,\"hint\":\"untrusted injected instruction\"}",
                "ERROR", List.of());
        ChatEvidenceHistoryProjector.HistoryTurn turn = new ChatEvidenceHistoryProjector.HistoryTurn(
                List.of(UserMessage.from("prior question"), AiMessage.from("prior answer")),
                List.of(missingExcerpt, exhaustedExcerpt));

        List<ChatMessage> messages = project(List.of(UserMessage.from("required")), List.of(turn),
                List.of(), (ignored, reasoning) -> true).messages();

        AiMessage call = messages.stream().filter(AiMessage.class::isInstance).map(AiMessage.class::cast)
                .filter(message -> !message.toolExecutionRequests().isEmpty()).findFirst().orElseThrow();
        List<ToolExecutionResultMessage> results = messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).toList();
        assertThat(call.toolExecutionRequests()).extracting(request -> request.id())
                .containsExactly("missing-excerpt", "exhausted-excerpt");
        assertThat(results).extracting(ToolExecutionResultMessage::id)
                .containsExactly("missing-excerpt", "exhausted-excerpt");
        assertThat(results.getFirst().text()).contains("RESOURCE_NOT_FOUND",
                "does not limit the current attempt", ChatEvidenceHistoryProjector.READ_TOOL_ERROR_HISTORY_HINT)
                .doesNotContain("repairable", "private-source", "private-chunk", "untrusted injected instruction");
        assertThat(results.get(1).text()).contains("RESOURCE_NOT_FOUND",
                ChatEvidenceHistoryProjector.READ_TOOL_ERROR_HISTORY_HINT)
                .doesNotContain("repairable", "private-source", "private-chunk", "untrusted injected instruction");
    }

    @Test
    void projectsHistoryWithoutReasoningAsNativeCallsWithPairedResults() {
        ChatToolEvidence legacyEvidence = evidence("iteration-without-reasoning", 0, 0, "call-without-reasoning",
                "query", "prior factual excerpt", "source-1", "revision-1");
        var history = new ChatEvidenceHistoryProjector.HistoryTurn(
                List.of(UserMessage.from("prior user turn"), AiMessage.from("prior final reply")),
                List.of(legacyEvidence));

        ChatEvidenceHistoryProjector.Projection projection = project(
                List.of(UserMessage.from("required")), List.of(history), List.of(UserMessage.from("current")),
                (ignored, reasoning) -> true);
        AiProviderRequest mapped = map(projection.messages(), ToolSpecification.builder().name(TOOL)
                .description("search").parameters(JsonObjectSchema.builder().build()).build());

        int callIndex = indexOfCall(mapped.messages(), "call-without-reasoning");
        assertThat(callIndex).isGreaterThanOrEqualTo(0);
        AiProviderRequest.Message call = mapped.messages().get(callIndex);
        AiProviderRequest.Message result = mapped.messages().get(callIndex + 1);
        assertThat(call.role()).isEqualTo(AiMessageRole.ASSISTANT);
        assertThat(call.toolCalls()).singleElement().satisfies(toolCall -> {
            assertThat(toolCall.name()).isEqualTo(TOOL);
            assertThat(toolCall.argumentsJson()).contains("query");
        });
        assertThat(call.reasoningContent()).isNull();
        assertThat(result.role()).isEqualTo(AiMessageRole.TOOL);
        assertThat(result.toolCallId()).isEqualTo("call-without-reasoning");
        assertThat(result.content()).contains("prior factual excerpt", "source-1", "revision-1");
        assertThat(projection.reasoningByToolCallId()).doesNotContainKey("call-without-reasoning");
        assertThat(mapped.messages()).noneMatch(message -> "call-without-reasoning".equals(message.toolCallId())
                && message.role() != AiMessageRole.TOOL);
    }

    @Test
    void foldsOversizedNoReasoningHistoryResultWithoutBreakingTheToolPair() {
        ToolSpecification definition = ToolSpecification.builder().name(TOOL).description("search")
                .parameters(JsonObjectSchema.builder().build()).build();
        ChatToolEvidence oversized = evidence("large-result", 0, 0, "call-large-result",
                "query", "evidence ".repeat(500), "source-1", "revision-1");
        var turn = new ChatEvidenceHistoryProjector.HistoryTurn(
                List.of(UserMessage.from("prior question"), AiMessage.from("prior reply")), List.of(oversized));
        long byteLimit = 2_000;
        AtomicLong observedRequestWithFullResult = new AtomicLong();

        ChatEvidenceHistoryProjector.Projection projection = project(
                List.of(UserMessage.from("required context")), List.of(turn), List.of(UserMessage.from("current")),
                (messages, reasoning) -> {
                    long bytes = serializedBytes(messages, definition, reasoning);
                    boolean full = messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                            .map(ToolExecutionResultMessage.class::cast).anyMatch(result ->
                                    result.text().contains("evidence ".repeat(300)));
                    if (full) observedRequestWithFullResult.set(bytes);
                    return bytes <= byteLimit;
                });

        assertThat(observedRequestWithFullResult.get()).isGreaterThan(byteLimit);
        assertThat(projection.fits()).isTrue();
        assertThat(projection.reasoningByToolCallId()).doesNotContainKey("call-large-result");
        AiProviderRequest mapped = mapper.toProviderRequest(ChatRequest.builder().modelName("test-model")
                .messages(projection.messages()).toolSpecifications(definition).build(), "test-model", 256,
                projection.reasoningByToolCallId());
        int callIndex = indexOfCall(mapped.messages(), "call-large-result");
        assertThat(callIndex).isGreaterThanOrEqualTo(0);
        AiProviderRequest.Message call = mapped.messages().get(callIndex);
        AiProviderRequest.Message result = mapped.messages().get(callIndex + 1);
        assertThat(call.role()).isEqualTo(AiMessageRole.ASSISTANT);
        assertThat(call.toolCalls()).singleElement().satisfies(toolCall ->
                assertThat(toolCall.argumentsJson()).contains("query"));
        assertThat(result.role()).isEqualTo(AiMessageRole.TOOL);
        assertThat(result.toolCallId()).isEqualTo("call-large-result");
        assertThat(result.content()).contains("folded", "source-1", "revision-1")
                .doesNotContain("evidence ".repeat(300));
        assertThat(objectMapper.writeValueAsBytes(mapped)).hasSizeLessThanOrEqualTo((int) byteLimit);
    }

    @Test
    void foldsOutAnOversizedReasoningIterationAsAWholeProviderMessageGroup() {
        ToolSpecification definition = ToolSpecification.builder().name(TOOL).description("search")
                .parameters(JsonObjectSchema.builder().build()).build();
        ChatToolEvidence oversized = evidence("large-reasoning", 0, 0, "call-large-reasoning",
                "query", "factual excerpt", "source-1", "revision-1", "thinking ".repeat(500));
        var turn = new ChatEvidenceHistoryProjector.HistoryTurn(
                List.of(UserMessage.from("prior question"), AiMessage.from("prior reply")), List.of(oversized));
        long byteLimit = 2_500;
        AtomicLong observedRequestWithReasoning = new AtomicLong();

        ChatEvidenceHistoryProjector.Projection projection = project(
                List.of(UserMessage.from("required context")), List.of(turn), List.of(UserMessage.from("current")),
                (messages, reasoning) -> {
                    long bytes = serializedBytes(messages, definition, reasoning);
                    if (reasoning.containsKey("call-large-reasoning")) observedRequestWithReasoning.set(bytes);
                    return bytes <= byteLimit;
                });

        assertThat(observedRequestWithReasoning.get()).isGreaterThan(byteLimit);
        assertThat(projection.fits()).isTrue();
        assertThat(projection.reasoningByToolCallId()).doesNotContainKey("call-large-reasoning");
        AiProviderRequest mapped = mapper.toProviderRequest(ChatRequest.builder().modelName("test-model")
                .messages(projection.messages()).toolSpecifications(definition).build(), "test-model", 256,
                projection.reasoningByToolCallId());
        assertThat(mapped.messages()).noneMatch(message -> message.toolCalls().stream()
                .anyMatch(call -> call.id().equals("call-large-reasoning")));
        assertThat(mapped.messages()).noneMatch(message -> "call-large-reasoning".equals(message.toolCallId()));
        assertThat(objectMapper.writeValueAsBytes(mapped)).hasSizeLessThanOrEqualTo((int) byteLimit);
    }

    @Test
    void removesOldTurnsInStableOrderWhenFoldedEvidenceStillExceedsCapacity() {
        var oldest = new ChatEvidenceHistoryProjector.HistoryTurn(List.of(UserMessage.from("oldest")), List.of());
        var middle = new ChatEvidenceHistoryProjector.HistoryTurn(List.of(UserMessage.from("middle")), List.of());
        var latest = new ChatEvidenceHistoryProjector.HistoryTurn(List.of(UserMessage.from("latest")), List.of());
        var result = project(List.of(UserMessage.from("fixed")), List.of(oldest, middle, latest),
                List.of(UserMessage.from("current")), (messages, reasoning) -> messages.size() <= 3);

        assertThat(result.fits()).isTrue();
        assertThat(result.messages()).containsExactly(UserMessage.from("fixed"), UserMessage.from("latest"),
                UserMessage.from("current"));
    }

    private ChatEvidenceHistoryProjector.Projection project(List<ChatMessage> required,
            List<ChatEvidenceHistoryProjector.HistoryTurn> turns, List<ChatMessage> current,
            BiPredicate<List<ChatMessage>, Map<String, String>> fits) {
        return projector.project(required, turns, List.of(), current, List.of(), (messages, reasoning) ->
                fits.test(messages, reasoning)
                        ? new AiChatRequestCapacity.Check(AiChatRequestCapacity.Dimension.FITS, 0, 0, 0)
                        : new AiChatRequestCapacity.Check(AiChatRequestCapacity.Dimension.SERIALIZED_REQUEST_BYTES,
                                1, 0, 0));
    }

    private ChatEvidenceHistoryProjector.Projection project(List<ChatMessage> required,
            List<ChatEvidenceHistoryProjector.HistoryTurn> turns, List<ChatMessage> protectedCurrent,
            List<ChatMessage> currentExchanges, List<ChatToolEvidence> currentEvidence,
            BiPredicate<List<ChatMessage>, Map<String, String>> fits) {
        return projector.project(required, turns, protectedCurrent, currentExchanges, currentEvidence,
                (messages, reasoning) -> fits.test(messages, reasoning)
                        ? new AiChatRequestCapacity.Check(AiChatRequestCapacity.Dimension.FITS, 0, 0, 0)
                        : new AiChatRequestCapacity.Check(AiChatRequestCapacity.Dimension.SERIALIZED_REQUEST_BYTES,
                                1, 0, 0));
    }

    private List<ChatMessage> toolExchange(ChatToolEvidence evidence) {
        ToolExecutionRequest request = ToolExecutionRequest.builder().id(evidence.toolCallId())
                .name(evidence.toolName()).arguments(evidence.argumentsJson()).build();
        return List.of(AiMessage.from(List.of(request)), ToolExecutionResultMessage.from(
                evidence.toolCallId(), evidence.toolName(), evidence.resultJson()));
    }

    private long serializedBytes(List<ChatMessage> messages, ToolSpecification definition) {
        return serializedBytes(messages, definition, Map.of());
    }

    private long serializedBytes(List<ChatMessage> messages, ToolSpecification definition,
                                 Map<String, String> reasoningByToolCallId) {
        try {
            ChatRequest request = ChatRequest.builder().modelName("test-model")
                    .messages(messages).toolSpecifications(definition).build();
            return objectMapper.writeValueAsBytes(mapper.toProviderRequest(request, "test-model", 256,
                    reasoningByToolCallId)).length;
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
        return evidence(iteration, iterationOrder, callOrder, callId, query, excerpt, sourceId, revision, null);
    }

    private ChatToolEvidence evidence(String iteration, int iterationOrder, int callOrder, String callId,
            String query, String excerpt, String sourceId, String revision, String reasoningContent) {
        String args = "{\"query\":\"" + query + "\"}";
        String result = "{\"evidence\":[{\"sourceId\":\"" + sourceId + "\",\"chunkId\":\"chunk-1\","
                + "\"ordinal\":7,\"title\":\"Study\",\"excerpt\":\"" + excerpt + "\"}]}";
        return new ChatToolEvidence(iteration, iterationOrder, callOrder, callId, TOOL, args, result,
                "COMPLETED", List.of(new ChatToolEvidence.SourceRevision(sourceId, revision)), reasoningContent);
    }
}
