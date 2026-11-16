package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.*;
import com.auralis.app.ai.internal.persistence.ChatActivityEntity;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.usage.*;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.PartialResponse;
import dev.langchain4j.model.chat.response.PartialResponseContext;
import dev.langchain4j.model.chat.response.CompleteToolCall;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.FinishReason;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.junit.jupiter.api.Test;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(OutputCaptureExtension.class)
class ChatAgentProtocolPublicationTests {
    @Test
    void usageAccountingUsesZeroOnlyForMissingLedgerAndOmitsCountsOnQueryFailure() {
        UUID userId = UUID.randomUUID();
        UUID missingBudgetTaskId = UUID.randomUUID();
        UUID brokenBudgetTaskId = UUID.randomUUID();
        ChatRunEntity missingRun = mock(ChatRunEntity.class);
        ChatRunEntity brokenRun = mock(ChatRunEntity.class);
        when(missingRun.getBudgetTaskId()).thenReturn(missingBudgetTaskId);
        when(brokenRun.getBudgetTaskId()).thenReturn(brokenBudgetTaskId);
        AiUsageQueryService usageQuery = mock(AiUsageQueryService.class);
        when(usageQuery.taskUsageForOwner(userId, missingBudgetTaskId, java.util.Set.of(AiOperationKind.CHAT_AGENT_TURN)))
                .thenThrow(new DomainException("RESOURCE_NOT_FOUND", "No usage rows"));
        when(usageQuery.taskUsageForOwner(userId, brokenBudgetTaskId, java.util.Set.of(AiOperationKind.CHAT_AGENT_TURN)))
                .thenThrow(new IllegalStateException("synthetic query failure"));
        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(null, null, null, null, null, null,
                ChatAgentProperties.defaults(), null, usageQuery, new ObjectMapper(), null);

        assertThat(orchestrator.accounting(userId, missingRun))
                .containsEntry("modelCalls", 0L).containsEntry("embeddingCalls", 0L);
        assertThat(orchestrator.accounting(userId, brokenRun))
                .doesNotContainKeys("modelCalls", "embeddingCalls");
    }

    @Test
    void successfulToolEvidenceIsPrivateAndRestoredIntoTheNextTurnProviderRequest() throws Exception {
        UUID userId = UUID.randomUUID(), conversationId = UUID.randomUUID(), sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID(), firstRunId = UUID.randomUUID(), secondRunId = UUID.randomUUID();
        UUID firstAttemptId = UUID.randomUUID(), secondAttemptId = UUID.randomUUID();
        UUID firstUserId = UUID.randomUUID(), firstReplyId = UUID.randomUUID();
        UUID secondUserId = UUID.randomUUID(), secondReplyId = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String context = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity firstRun = new ChatRunEntity(firstRunId, userId, conversationId, "request-1", "hash-1",
                context, "turn", firstUserId, UUID.randomUUID(), 1L);
        ChatRunEntity secondRun = new ChatRunEntity(secondRunId, userId, conversationId, "request-2", "hash-2",
                context, "turn", secondUserId, UUID.randomUUID(), 3L);
        firstRun.pointToAttempt(firstAttemptId, firstReplyId);
        secondRun.pointToAttempt(secondAttemptId, secondReplyId);
        ChatAttemptEntity firstAttempt = new ChatAttemptEntity(firstAttemptId, firstRunId, userId, "request-1", "hash-1",
                1, "worker-a", 1L, firstReplyId, "[]", "[]", Instant.now().plusSeconds(60));
        ChatAttemptEntity secondAttempt = new ChatAttemptEntity(secondAttemptId, secondRunId, userId, "request-2", "hash-2",
                1, "worker-a", 3L, secondReplyId, "[]", "[]", Instant.now().plusSeconds(60));
        firstAttempt.markRunning(); secondAttempt.markRunning();
        MessageEntity firstUser = new MessageEntity(firstUserId, conversationId, userId, 1,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "What is the capital of France?", null, null, null, null);
        MessageEntity secondUser = new MessageEntity(secondUserId, conversationId, userId, 3,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Explain that fact", null, null, null, null);
        MessageView firstUserView = new MessageView(firstUserId, 1, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                "What is the capital of France?", null, null, Instant.now());
        MessageView firstReplyView = new MessageView(firstReplyId, 2, AiMessageRole.ASSISTANT, AiMessageStatus.COMPLETED,
                "The capital of France is Paris. The available source excerpt is unrelated and does not support this answer.",
                null, null, Instant.now());
        MessageView secondUserView = new MessageView(secondUserId, 3, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                "Explain that fact", null, null, Instant.now());

        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        List<AiProviderRequest> providerRequests = new ArrayList<>();
        AtomicInteger providerCall = new AtomicInteger();
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);
        ToolSpecification definition = ToolSpecification.fromJson("{\"name\":\"read_source_excerpt\","
                + "\"description\":\"Read source evidence\",\"parameters\":{\"type\":\"object\","
                + "\"properties\":{\"sourceId\":{\"type\":\"string\"}},\"required\":[\"sourceId\"]}}");
        when(persistence.claim(userId, conversationId, firstRunId, firstAttemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.claim(userId, conversationId, secondRunId, secondAttemptId, 3L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionOwner(userId, conversationId, firstRunId, firstAttemptId, 1L)).thenReturn(true);
        when(persistence.executionOwner(userId, conversationId, secondRunId, secondAttemptId, 3L)).thenReturn(true);
        when(persistence.cancellationRequested(userId, firstRunId, firstAttemptId)).thenReturn(false);
        when(persistence.cancellationRequested(userId, secondRunId, secondAttemptId)).thenReturn(false);
        when(persistence.executionProfile(eq(userId), eq(conversationId), any(UUID.class)))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK, "test-model", endpointHash));
        when(persistence.finish(eq(userId), eq(conversationId), eq(firstRunId), eq(firstAttemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenReturn(new ChatRuntimePersistenceService.Terminal(firstRun, firstAttempt, firstReplyId));
        when(persistence.finish(eq(userId), eq(conversationId), eq(secondRunId), eq(secondAttemptId), eq(3L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenReturn(new ChatRuntimePersistenceService.Terminal(secondRun, secondAttempt, secondReplyId));
        when(persistence.conversationRunHistory(userId, conversationId)).thenReturn(List.of(), List.of(firstRun, secondRun));
        when(persistence.privateToolEvidence(userId, conversationId, firstRunId, firstAttemptId))
                .thenAnswer(ignored -> firstAttempt.getPrivateToolEvidenceJson());
        doAnswer(invocation -> { firstAttempt.updatePrivateToolEvidence(invocation.getArgument(9)); return null; })
                .when(persistence).checkpoint(eq(userId), eq(conversationId), eq(firstRunId), eq(firstAttemptId), eq(1L),
                        anyMap(), anyString(), anyString(), anyLong(), anyString());
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        AiChatRequestMapper testRequestMapper = new AiChatRequestMapper(new ObjectMapper());
        ChatReadTools descriptionSource = new ChatReadTools(null, null, null, null, null, null, null,
                ChatAgentProperties.defaults(), null);
        when(tools.sdkDefinitions()).thenReturn(DisplayToolRegistry.definitions(descriptionSource.definitions())
                .stream().map(testRequestMapper::toSdkTool).toList());
        when(readScope.revisionSnapshot()).thenReturn(Map.of(sourceId, revision));
        when(tools.execute(eq(readScope), any(AiTaskScope.class), eq("read_source_excerpt"), anyString())).thenReturn(
                "{\"sourceId\":\"" + sourceId + "\",\"chunkId\":\"chunk-private\",\"ordinal\":7,"
                        + "\"title\":\"Photosynthesis\",\"query\":\"query\",\"range\":{\"start\":1,\"end\":2},"
                        + "\"excerpt\":\"PRIVATE_FACT_9C31\"}");
        when(gateway.beginTask(any())).thenAnswer(invocation -> {
            AiTaskContext taskContext = invocation.getArgument(0);
            AiTaskScope taskScope = mock(AiTaskScope.class);
            UUID logicalRunId = taskContext.budgetTaskId();
            when(taskScope.taskId()).thenReturn(AiTaskContext.chatAgentLedgerTaskId(userId, logicalRunId));
            doAnswer(streamInvocation -> {
                AiProviderRequest request = streamInvocation.getArgument(2);
                providerRequests.add(request);
                int callNo = providerCall.incrementAndGet();
                @SuppressWarnings("unchecked")
                java.util.function.Consumer<AiProviderChunk> chunks = streamInvocation.getArgument(6);
                if (callNo == 1) {
                    chunks.accept(reasoningChunk("I need authorized source evidence."));
                    chunks.accept(toolCallChunk("resp-1", "call-1", "read_source_excerpt",
                            "{\"sourceId\":\"" + sourceId + "\"}"));
                    chunks.accept(terminalChunk("resp-1", "tool_calls"));
                } else if (callNo == 2) {
                    chunks.accept(reasoningChunk("The source supports the answer."));
                    chunks.accept(new AiProviderChunk("The evidence says this.", false,
                            null, AiProviderModelIdentity.missing()));
                    chunks.accept(terminalChunk("resp-2", "stop"));
                } else if (callNo == 3) {
                    chunks.accept(new AiProviderChunk("Follow up answer.", false,
                            null, AiProviderModelIdentity.missing()));
                    chunks.accept(terminalChunk("resp-3", "stop"));
                } else {
                    throw new AssertionError("unexpected synthetic provider call " + callNo);
                }
                return new AiInvocationResult<Void>(null, new AiProviderUsage(1, 1, 1L, 1L, 2, true));
            }).when(taskScope).stream(eq(AiStage.CHAT_COMPLETION), eq(AiProviderType.DEEPSEEK),
                    any(AiProviderRequest.class), any(AiCredential.class), eq(AiCredentialSource.PLATFORM),
                    any(AiProviderCallCancellation.class), any());
            when(taskScope.usage()).thenReturn(new AiProviderUsage(1, 1, 1L, 1L, 2, true));
            return taskScope;
        });
        when(adapterFactory.create(any(), any(AiTaskScope.class), any())).thenAnswer(invocation ->
                new ChatAgentModelAdapter(invocation.getArgument(0), invocation.getArgument(1),
                        new AiChatRequestMapper(new ObjectMapper()), ChatAgentProperties.defaults(), 4096,
                        10_000, true, invocation.getArgument(2)));
        when(conversations.get(userId, conversationId)).thenReturn(
                new ConversationView(conversationId, "Chat", List.of(), Instant.now(), Instant.now(), null, 0L,
                        (short) 1, true, null,
                        com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null),
                new ConversationView(conversationId, "Chat", List.of(firstUserView, firstReplyView, secondUserView),
                        Instant.now(), Instant.now(), null, 0L, (short) 1, true, null,
                        com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
        when(messages.findById(firstUserId)).thenReturn(Optional.of(firstUser));
        when(messages.findById(secondUserId)).thenReturn(Optional.of(secondUser));
        when(persistence.requireRun(userId, conversationId, firstRunId)).thenReturn(firstRun);
        when(persistence.attemptHistory(firstRunId)).thenReturn(List.of(firstAttempt));
        when(persistence.executionActive(userId, conversationId, firstRunId)).thenReturn(false);
        AuralisProperties runtimeProperties = mock(AuralisProperties.class);
        AuralisProperties.Ai runtimeAiProperties = mock(AuralisProperties.Ai.class);
        when(runtimeProperties.ai()).thenReturn(runtimeAiProperties);
        when(runtimeAiProperties.maxPromptChars()).thenReturn(50_000);
        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, new ChatAgentProperties(0, 0, 8, 1, 65_536, 524_288, 300), tools,
                mock(AiUsageQueryService.class),
                new ObjectMapper(), runtimeProperties);
        List<ChatSseEnvelope> events = new ArrayList<>();
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(firstRun, firstAttempt, firstUserId, false),
                "request-1", null, events::add);
        firstAttempt.updateSnapshot(firstAttempt.getPublicPartsJson(),
                "[{\"id\":\"call-1\",\"name\":\"search\",\"status\":\"completed\"}]",
                firstAttempt.getLastSequence());
        ChatRunStatusView status = orchestrator.status(userId, conversationId, firstRunId);
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(secondRun, secondAttempt, secondUserId, false),
                "request-2", null, event -> {});

        for (int requestIndex : List.of(0, 1, 2)) {
            assertThat(providerRequests.get(requestIndex).messages())
                    .as("mapped provider request %s includes Chinese language and visual selection rules", requestIndex)
                    .anySatisfy(message -> {
                        assertThat(message.role()).isEqualTo(AiMessageRole.SYSTEM);
                assertThat(message.content()).contains(
                                "本轮显式授权范围优先于聊天历史和以前 attempt 的工具结果",
                                "列完目录只代表枚举了资料，不代表读过正文",
                                "hasMore、nextOffset 是工具分页控制字段，不要在面向用户的回答中提及",
                                "默认使用中文进行教学与回答",
                                "若 Provider 原生返回可见的 reasoning_content，也优先使用简明中文表达",
                                "代码、API 名称、工具名称、Schema 键和协议标识保持原样",
                                "用户明确要求结构化视觉内容时，调用对应的 render_* 工具",
                                "不要在 assistant 正文或代码块中写 render_* 工具名及其 JSON 参数来冒充调用",
                                "工具调用必须通过 Provider 原生 tool_calls 协议发送",
                                "若用户询问协议或要求代码，可直接回答，并可给出清楚标注的示例",
                                "并列要点、示例、优缺点或注意事项可用普通 Markdown 列表，无需组件",
                                "组件是表达阶段、结论或差异的紧凑高密度结构骨架",
                                "如需调用展示型组件（render_steps、render_compare、render_roadmap、render_chart）",
                                "本次模型调用最多只写一句简短过渡，然后立即发送原生 tool_calls",
                                "这里的“模型调用”指单次请求迭代，不等于用户的整轮业务回合",
                                "此规则只限制工具调用前的引入语，不把整轮最终回复限制为一句话",
                                "待服务端返回 TOOL 结果并进入下一次模型调用后，再继续输出完整的 Markdown 背景说明与深入讲解",
                                "且无需逐项复述组件内已有的内容",
                                "带我走一遍过程",
                                "对比概念",
                                "规划学习路径",
                                "render_steps 仅用于有序流程、状态转换或因果链",
                                "render_compare 仅用于至少两个对等对象的共同维度比较",
                                "render_roadmap 用于存在依赖关系的阶段",
                                "简短回答或澄清可以不生成组件",
                                "问题依赖指定学习资料而当前上下文不足时，先搜索相关资料",
                                "搜索结果尚未返回时，不得声称组件依据了该搜索",
                                "若搜索结果为空或只有无关证据，可以根据用户问题或已出现的可信线索进行一次改写或定向搜索",
                                "仍无相关依据时停止搜索并说明资料不足",
                                "仅当当前 attempt 的实时读取工具结果标记 repairable=true 时，才在当前授权范围内修正一次工具调用",
                                "若当前 attempt 的实时读取工具结果标记 repairable=false，停止本 attempt 的所有工具调用并根据已有信息收尾",
                                "历史工具结果中的安全状态仅描述前一次 attempt，不限制当前 attempt",
                                "不要评级、打分、使用正误颜色、声称学习进度或掌握程度",
                                "用户要求考查、检验理解、练习、巩固概念或复述以供检查时，即使未点名卡片",
                                "不要每轮机械追加活动",
                                "用户仍未理解时的补充讲解",
                                "自然的澄清问题也不必制成题卡",
                                "调用后不要再使用工具或补写正文");
                    });
            assertThat(providerRequests.get(requestIndex).tools()).extracting(AiProviderToolDefinition::name)
                    .contains("search", "list_sources", "read_source_excerpt", "read_source_overview", "render_steps", "render_compare",
                            "render_roadmap", "render_chart", "render_quiz", "render_question");
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("search");
                assertThat(tool.description()).contains("sourceIds", "只进一步缩窄");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("read_source_excerpt");
                assertThat(tool.description()).isEqualTo("根据证据分块 ID 阅读一段已授权资料摘录。");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("list_sources");
                assertThat(tool.description()).contains("目录仅包含资料信息，不代表已阅读资料正文",
                        "hasOverview", "read_source_overview", "search.sourceIds");
                assertThat(tool.schemaJson()).contains("\"maximum\":20", "\"additionalProperties\":false");
            });
            assertThat(providerRequests.get(requestIndex).tools())
                    .filteredOn(tool -> tool.name().equals("read_source_overview")).singleElement().satisfies(tool -> {
                assertThat(tool.name()).isEqualTo("read_source_overview");
                assertThat(tool.description()).contains("overviewVersion", "8192");
                assertThat(tool.schemaJson()).contains("overviewVersion", "\"maximum\":8192",
                        "\"additionalProperties\":false");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("render_steps");
                assertThat(tool.description()).contains("带我走一遍过程", "有序步骤、状态转换或因果链", "按顺序将每一步放入 items", "紧凑，作为结构骨架");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("render_compare");
                assertThat(tool.description()).contains("对比概念", "至少有两个对等对象", "共同维度比较", "不要强行比较");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("render_roadmap");
                assertThat(tool.description()).contains("规划学习路径", "阶段存在依赖关系", "不要把普通列表改名为路线图");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("render_chart");
                assertThat(tool.description()).contains("柱状图或占比图", "数值必须由用户提供或有已收到的证据支持", "不要编造数据", "label/value 项");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("render_quiz");
                assertThat(tool.description()).contains("用户要求考查", "检查理解", "不要每轮机械追加", "key 唯一的选项", "私有信息");
            });
            assertThat(providerRequests.get(requestIndex).tools()).anySatisfy(tool -> {
                assertThat(tool.name()).isEqualTo("render_question");
                assertThat(tool.description()).contains("开放回答练习", "复述", "自然的澄清问题不必制成卡片", "私有 reference");
            });
        }
        assertThat(providerRequests.get(0).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.SYSTEM);
            assertThat(message.content()).contains("assistant 正文使用普通 Markdown",
                    "本轮显式授权范围优先于聊天历史和以前 attempt 的工具结果",
                    "不要在面向用户的回答中提及",
                    "用户明确要求结构化视觉内容时，调用对应的 render_* 工具",
                    "授权读取范围标记为 SUBJECT",
                    "必须继续按 nextOffset 分页直至 hasMore=false",
                    "Catalog sourceId 可用于 read_source_overview",
                    "作为 search.sourceIds 在本轮授权范围内缩窄检索",
                    "sourceIds 只能取自当前目录或已返回结果",
                    "未提供 sourceIds 时 search 按原本授权范围检索",
                    "read_source_excerpt 的 chunkId 必须来自真实工具结果",
                    "任何活动工具调用都必须是本轮最后一次工具调用")
                    .doesNotContain(":::auralis-", "NDJSON");
        });
        assertThat(providerRequests.get(0).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.USER);
            assertThat(message.content()).isEqualTo("What is the capital of France?");
        });
        assertThat(providerRequests.get(0).messages().toString())
                .doesNotContain("Photosynthesis", "PRIVATE_FACT_9C31", sourceId.toString(), revision.toString());

        assertThat(providerRequests).hasSize(3);
        assertThat(providerRequests.get(1).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.ASSISTANT);
            assertThat(message.reasoningContent()).isEqualTo("I need authorized source evidence.");
            assertThat(message.toolCalls()).extracting(AiProviderToolCall::id).containsExactly("call-1");
        });
        assertThat(providerRequests.get(1).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.SYSTEM);
            assertThat(message.content()).contains(
                    "先判断问题是否依赖用户的学习资料",
                    "判断搜索结果是否支持具体问题，不要只看关键词是否重合",
                    "仍无相关依据时停止搜索并说明资料不足",
                    "不要反复换同义词搜索",
                    "只有用户没有要求严格依据资料时，才可把一般知识作为明确区分的补充",
                    "授权读取范围标记为 SUBJECT",
                    "Catalog sourceId 可用于 read_source_overview",
                    "作为 search.sourceIds 在本轮授权范围内缩窄检索",
                    "sourceIds 只能取自当前目录或已返回结果",
                    "用户明确要求结构化视觉内容时，调用对应的 render_* 工具",
                    "工具调用必须通过 Provider 原生 tool_calls 协议发送",
                    "如需调用展示型组件（render_steps、render_compare、render_roadmap、render_chart）",
                    "本次模型调用最多只写一句简短过渡，然后立即发送原生 tool_calls",
                    "这里的“模型调用”指单次请求迭代，不等于用户的整轮业务回合",
                    "待服务端返回 TOOL 结果并进入下一次模型调用后，再继续输出完整的 Markdown 背景说明与深入讲解",
                    "且无需逐项复述组件内已有的内容")
                    .doesNotContain("已有背景说明", "Visual 工具结果后可以继续解释", "不限制资料工具调用时的正文");
        });
        assertThat(providerRequests.get(1).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.TOOL);
            assertThat(message.toolCallId()).isEqualTo("call-1");
            assertThat(message.content()).contains("Photosynthesis", "PRIVATE_FACT_9C31");
        });
        assertThat(providerRequests.get(1).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.SYSTEM);
            assertThat(message.content()).contains("tool-call allowance for this attempt is exhausted",
                    "a closeout instruction takes precedence");
        });
        assertThat(firstAttempt.getPrivateToolEvidenceJson()).contains("PRIVATE_FACT_9C31", revision.toString(),
                "chunk-private", "I need authorized source evidence.");
        assertThat(providerRequests.get(2).messages()).anySatisfy(message -> {
            assertThat(message.role()).isEqualTo(AiMessageRole.ASSISTANT);
            assertThat(message.reasoningContent()).isEqualTo("I need authorized source evidence.");
            assertThat(message.toolCalls()).extracting(AiProviderToolCall::id).containsExactly("call-1");
        });
        List<AiProviderRequest.Message> requestMessages = providerRequests.get(2).messages();
        int priorUserIndex = indexOfProviderRoleContent(requestMessages, AiMessageRole.USER, "What is the capital of France?");
        int toolCallIndex = indexOfProviderToolCall(requestMessages, "call-1");
        int toolResultIndex = indexOfProviderToolResult(requestMessages, "call-1");
        int finalReplyIndex = indexOfProviderRoleContent(requestMessages, AiMessageRole.ASSISTANT,
                "The capital of France is Paris. The available source excerpt is unrelated and does not support this answer.");
        int currentUserIndex = indexOfProviderRoleContent(requestMessages, AiMessageRole.USER, "Explain that fact");
        assertThat(priorUserIndex).isLessThan(toolCallIndex);
        assertThat(toolCallIndex).isLessThan(toolResultIndex);
        assertThat(toolResultIndex).isLessThan(finalReplyIndex);
        assertThat(finalReplyIndex).isLessThan(currentUserIndex);
        String publicStatus = new ObjectMapper().writeValueAsString(status);
        String publicView = new ObjectMapper().writeValueAsString(conversations.get(userId, conversationId));
        assertThat(publicStatus).doesNotContain("PRIVATE_FACT_9C31", "chunk-private", "I need authorized source evidence.", "argumentsJson", "resultJson");
        assertThat(publicView).doesNotContain("PRIVATE_FACT_9C31", "chunk-private", "I need authorized source evidence.", "argumentsJson", "resultJson");
        assertThat(status.toolTrace().toString()).doesNotContain("PRIVATE_FACT_9C31", "chunk-private");
        assertThat(status.accountingSummary()).containsEntry("currentAttemptToolCalls", 1L);
        assertThat(events).extracting(ChatSseEnvelope::event)
                .containsSubsequence("reasoning.delta", "tool.started", "tool.completed", "reasoning.delta", "text.delta");
    }

    @Test
    void preservesBudgetCodeWhenNextIterationFailsAfterToolCompletion(CapturedOutput output) throws Exception {
        UUID userId = UUID.randomUUID(), conversationId = UUID.randomUUID(), sourceId = UUID.randomUUID();
        UUID runId = UUID.randomUUID(), attemptId = UUID.randomUUID(), userMessageId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID(), revision = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String context = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity run = new ChatRunEntity(runId, userId, conversationId, "request-failure", "hash",
                context, "turn", userMessageId, UUID.randomUUID(), 1L);
        run.pointToAttempt(attemptId, replyId);
        ChatAttemptEntity attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-failure", "hash", 1,
                "worker-a", 1L, replyId, "[]", "[]", Instant.now().plusSeconds(60));
        attempt.markRunning();
        MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 1,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Find one source fact", null, null, null, null);

        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);
        ToolSpecification definition = ToolSpecification.fromJson("{\"name\":\"read_source_excerpt\","
                + "\"description\":\"Read source evidence\",\"parameters\":{\"type\":\"object\","
                + "\"properties\":{\"sourceId\":{\"type\":\"string\"}},\"required\":[\"sourceId\"]}}");
        when(persistence.claim(userId, conversationId, runId, attemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(userId, conversationId, runId))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK,
                        "test-model", endpointHash));
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenAnswer(invocation -> {
                    run.mark(invocation.getArgument(6));
                    attempt.completeMessage(replyId, invocation.getArgument(6), invocation.getArgument(12));
                    return new ChatRuntimePersistenceService.Terminal(run, attempt, replyId);
                });
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        when(tools.sdkDefinitions()).thenReturn(List.of(definition));
        when(readScope.revisionSnapshot()).thenReturn(Map.of(sourceId, revision));
        AtomicBoolean toolReturned = new AtomicBoolean();
        AtomicInteger validationsAfterTool = new AtomicInteger();
        doAnswer(invocation -> {
            if (toolReturned.get() && validationsAfterTool.incrementAndGet() == 2) {
                throw new AiUsageLimitException("AI_TASK_BUDGET_EXCEEDED", 422, 0, null);
            }
            return null;
        }).when(readScope).validateCurrent();
        when(tools.execute(eq(readScope), eq(taskScope), eq("read_source_excerpt"), anyString())).thenAnswer(invocation -> {
            toolReturned.set(true);
            return "{}";
        });
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(taskScope.taskId()).thenReturn(AiTaskContext.chatAgentLedgerTaskId(userId, runId));
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            java.util.function.Consumer<AiProviderChunk> chunks = invocation.getArgument(6);
            chunks.accept(toolCallChunk("resp-tool", "call-safe-log", "read_source_excerpt",
                    "{\"sourceId\":\"" + sourceId + "\"}"));
            chunks.accept(terminalChunk("resp-tool", "tool_calls"));
            return new AiInvocationResult<Void>(null, new AiProviderUsage(1, 1, 1L, 1L, 2, true));
        }).when(taskScope).stream(eq(AiStage.CHAT_COMPLETION), eq(AiProviderType.DEEPSEEK),
                any(AiProviderRequest.class), any(AiCredential.class), eq(AiCredentialSource.PLATFORM),
                any(AiProviderCallCancellation.class), any());
        when(taskScope.usage()).thenReturn(new AiProviderUsage(1, 1, 1L, 1L, 2, true));
        when(adapterFactory.create(any(), eq(taskScope), any())).thenAnswer(invocation ->
                new ChatAgentModelAdapter(invocation.getArgument(0), invocation.getArgument(1),
                        new AiChatRequestMapper(new ObjectMapper()), ChatAgentProperties.defaults(), 4096,
                        10_000, true, invocation.getArgument(2)));
        when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                List.of(), Instant.now(), Instant.now(), null, 0L, (short) 1, true, null, com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
        when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));

        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, ChatAgentProperties.defaults(), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), runtimeProperties());
        List<ChatSseEnvelope> events = new ArrayList<>();
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false),
                "request-failure", null, events::add);

        verify(tools).execute(eq(readScope), eq(taskScope), eq("read_source_excerpt"), anyString());
        verify(taskScope, times(1)).stream(eq(AiStage.CHAT_COMPLETION), eq(AiProviderType.DEEPSEEK),
                any(AiProviderRequest.class), any(AiCredential.class), eq(AiCredentialSource.PLATFORM),
                any(AiProviderCallCancellation.class), any());
        verify(persistence).finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                eq("FAILED"), anyString(), anyString(), anyLong(), anyString(), anyString(), eq("AI_TASK_BUDGET_EXCEEDED"));
        assertThat(events).extracting(ChatSseEnvelope::event).contains("tool.completed", "run.failed");
        assertThat(events.stream().filter(event -> event.event().equals("run.failed")).findFirst().orElseThrow()
                .payload().get("safeErrorCode")).isEqualTo("AI_TASK_BUDGET_EXCEEDED");
        assertThat(output.getOut()).contains("CHAT_RUN_FAILED", "runId=" + runId, "attemptId=" + attemptId,
                "iteration=2", "stage=iteration_pre_dispatch", "safeErrorCode=AI_TASK_BUDGET_EXCEEDED",
                "exceptionType=com.auralis.app.ai.usage.AiUsageLimitException", "frameClass=com.auralis.app.ai.internal.chat.ChatAgentProtocolPublicationTests",
                "frameMethod=", "frameLine=")
                .doesNotContain("synthetic-key", "Find one source fact");
    }

    private int indexOfProviderRoleContent(List<AiProviderRequest.Message> messages, AiMessageRole role, String content) {
        for (int i = 0; i < messages.size(); i++) {
            AiProviderRequest.Message message = messages.get(i);
            if (message.role() == role && content.equals(message.content())) return i;
        }
        return -1;
    }

    private int indexOfProviderToolCall(List<AiProviderRequest.Message> messages, String id) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i).toolCalls().stream().anyMatch(call -> call.id().equals(id))) return i;
        }
        return -1;
    }

    private int indexOfProviderToolResult(List<AiProviderRequest.Message> messages, String id) {
        for (int i = 0; i < messages.size(); i++) {
            if (messages.get(i).role() == AiMessageRole.TOOL && id.equals(messages.get(i).toolCallId())) return i;
        }
        return -1;
    }

    private AiProviderChunk reasoningChunk(String reasoning) {
        return new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), null,
                null, null, null, false, reasoning);
    }

    private AiProviderChunk toolCallChunk(String responseId, String toolCallId, String name, String arguments) {
        return new AiProviderChunk("", false, null, AiProviderModelIdentity.missing(), responseId, 0,
                new AiProviderToolCallDelta(toolCallId, name, arguments), null, false);
    }

    private AiProviderChunk terminalChunk(String responseId, String finishReason) {
        return new AiProviderChunk("", true, null, AiProviderModelIdentity.missing(), responseId,
                null, null, finishReason, true);
    }

    @Test
    void displayToolProgressPublishesOrderedMarkdownAndContinuesWithSmallToolResult() throws Exception {
        UUID userId = UUID.randomUUID(), conversationId = UUID.randomUUID(), runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID(), userMessageId = UUID.randomUUID(), replyId = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String requestContext = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity run = new ChatRunEntity(runId, userId, conversationId, "request-1", "hash", requestContext,
                "turn", userMessageId, UUID.randomUUID(), 1L);
        run.pointToAttempt(attemptId, replyId); run.mark("RUNNING");
        ChatAttemptEntity attempt = new ChatAttemptEntity(attemptId, runId, userId, "request-1", "hash", 1,
                "worker-a", 1L, replyId, "[]", "[]", Instant.now().plusSeconds(60));
        attempt.markRunning();
        MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 1,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "Explain the flow", null, null, null, null);
        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        ChatAgentModelAdapter adapter = mock(ChatAgentModelAdapter.class);
        mapRequestsWithActualMapper(adapter);
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);
        when(persistence.claim(userId, conversationId, runId, attemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(userId, conversationId, runId))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK, "test-model", endpointHash));
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenAnswer(invocation -> new ChatRuntimePersistenceService.Terminal(run, attempt, replyId));
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        when(tools.sdkDefinitions()).thenReturn(List.of(ToolSpecification.fromJson(
                "{\"name\":\"render_steps\",\"description\":\"steps\","
                        + "\"parameters\":{\"type\":\"object\",\"properties\":{}}}")));
        when(readScope.revisionSnapshot()).thenReturn(Map.of());
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(adapterFactory.create(any(), eq(taskScope), any())).thenReturn(adapter);
        when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                List.<MessageView>of(), Instant.now(), Instant.now(), null, 0L, (short) 1, true, null, com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
        when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));
        String arguments = "{\"title\":\"Flow\",\"items\":[{\"title\":\"One\"},{\"title\":\"Two\"}]}";
        ToolExecutionRequest toolRequest = ToolExecutionRequest.builder().id("display-1").name("render_steps")
                .arguments(arguments).build();
        AtomicInteger iteration = new AtomicInteger();
        AtomicReference<ChatRequest> nextRequest = new AtomicReference<>();
        AtomicReference<String> finishStatus = new AtomicReference<>();
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenAnswer(invocation -> {
                    String status = invocation.getArgument(6);
                    finishStatus.set(status);
                    run.mark(status);
                    attempt.completeMessage(replyId, status, invocation.getArgument(12));
                    return new ChatRuntimePersistenceService.Terminal(run, attempt, replyId);
                });
        doAnswer(invocation -> {
            ChatRequest request = invocation.getArgument(0);
            StreamingChatResponseHandler handler = invocation.getArgument(1);
            @SuppressWarnings("unchecked") java.util.function.Consumer<ToolCallProgress> progress = invocation.getArgument(3);
            int turn = iteration.incrementAndGet();
            if (turn == 1) {
                PartialResponseContext context = mock(PartialResponseContext.class);
                handler.onPartialResponse(new PartialResponse("Before :::auralis-steps is ordinary text."), context);
                progress.accept(new ToolCallProgress("response-1", 0, "display-1", null,
                        "{\"title\":\"Flow\",\"items\":[{\"title\":\"One\"},"));
                progress.accept(new ToolCallProgress("response-1", 0, "display-1", "render_steps",
                        "{\"title\":\"Two\"}]}"));
                handler.onCompleteToolCall(new CompleteToolCall(0, toolRequest));
                handler.onCompleteResponse(dev.langchain4j.model.chat.response.ChatResponse.builder()
                        .aiMessage(AiMessage.from(List.of(toolRequest))).finishReason(FinishReason.TOOL_EXECUTION).build());
            } else {
                nextRequest.set(request);
                PartialResponseContext context = mock(PartialResponseContext.class);
                handler.onPartialResponse(new PartialResponse("After."), context);
                handler.onCompleteResponse(dev.langchain4j.model.chat.response.ChatResponse.builder()
                        .aiMessage(AiMessage.from("After.")).finishReason(FinishReason.STOP).build());
            }
            return null;
        }).when(adapter).chatWithRawCapture(any(ChatRequest.class), any(StreamingChatResponseHandler.class),
                any(java.util.function.Consumer.class), any(java.util.function.Consumer.class));

        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, ChatAgentProperties.defaults(), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), runtimeProperties());
        List<ChatSseEnvelope> emitted = new ArrayList<>();
        orchestrator.executeAdmission(userId, new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false),
                "request-1", null, emitted::add);

        org.mockito.ArgumentCaptor<String> partsCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(persistence).finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), partsCaptor.capture(), anyString(), anyLong(), anyString(), anyString(), any());
        List<Map<String, Object>> parts = new ObjectMapper().readValue(partsCaptor.getValue(),
                new TypeReference<List<Map<String, Object>>>() {});
        assertThat(parts).extracting(part -> part.get("kind")).containsExactly("text", "block", "text");
        assertThat(parts.getFirst().get("text")).isEqualTo("Before :::auralis-steps is ordinary text.");
        assertThat(parts.get(1)).containsEntry("component", "steps").containsEntry("state", "READY");
        assertThat((List<?>) parts.get(1).get("items")).hasSize(2);
        assertThat(finishStatus.get()).isEqualTo("COMPLETED");
        assertThat(emitted).extracting(ChatSseEnvelope::event).containsSubsequence(
                "text.delta", "block.started", "block.item", "block.item", "tool.started",
                "block.completed", "tool.completed", "text.delta", "run.completed");
        assertThat(nextRequest.get().messages()).anySatisfy(message ->
                assertThat(message).isInstanceOf(ToolExecutionResultMessage.class));
        assertThat(nextRequest.get().messages().toString()).contains("rendered", "display-1");
    }

    @Test
    void activitySubmissionWithoutReferenceReachesNextLlmWithQuestionAndAnswer() throws Exception {
        UUID userId = UUID.randomUUID(), conversationId = UUID.randomUUID(), runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID(), userMessageId = UUID.randomUUID(), replyId = UUID.randomUUID();
        UUID originalRunId = UUID.randomUUID(), activityId = UUID.randomUUID(), blockId = UUID.randomUUID();
        String endpoint = "https://api.deepseek.com/v1";
        String endpointHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        String context = "{\"selectionText\":\"\",\"executionProfile\":{\"provider\":\"DEEPSEEK\","
                + "\"chatModel\":\"test-model\",\"endpointHash\":\"" + endpointHash + "\"}}";
        ChatRunEntity sourceRun = new ChatRunEntity(originalRunId, userId, conversationId, "source-request", "source-hash",
                context, "turn", UUID.randomUUID(), UUID.randomUUID(), 1L);
        ChatRunEntity run = new ChatRunEntity(runId, userId, conversationId, "submit-request", "submit-hash",
                context, "activity_submission", userMessageId, UUID.randomUUID(), 3L);
        run.pointToAttempt(attemptId, replyId);
        ChatAttemptEntity attempt = new ChatAttemptEntity(attemptId, runId, userId, "submit-request", "submit-hash", 1,
                "worker-a", 1L, replyId, "[]", "[]", Instant.now().plusSeconds(30));
        attempt.markRunning();
        MessageEntity userMessage = new MessageEntity(userMessageId, conversationId, userId, 3,
                AiMessageRole.USER, AiMessageStatus.COMPLETED, "My answer is B", null, null, null, null);
        ChatActivityEntity activity = new ChatActivityEntity(activityId, originalRunId, userId, UUID.randomUUID(),
                UUID.randomUUID(), blockId, 1, "single", "READY",
                "{\"component\":\"quiz\",\"meta\":{\"question\":\"Choose the correct item\","
                        + "\"questionType\":\"single\"},\"items\":[{\"key\":\"A\",\"text\":\"First\"},"
                        + "{\"key\":\"B\",\"text\":\"Second\"}]}", null);
        activity.markSubmitted(UUID.randomUUID(), "answer-hash", "[\"B\"]", userMessageId, runId,
                "{\"component\":\"quiz\",\"state\":\"SUBMITTED\",\"meta\":{\"question\":\"Choose the correct item\","
                        + "\"questionType\":\"single\"},\"items\":[{\"key\":\"A\",\"text\":\"First\"},"
                        + "{\"key\":\"B\",\"text\":\"Second\"}],\"submittedAnswer\":[\"B\"]}");

        ChatRuntimePersistenceService persistence = mock(ChatRuntimePersistenceService.class);
        ConversationService conversations = mock(ConversationService.class);
        MessageRepository messages = mock(MessageRepository.class);
        AiSettingsService settings = mock(AiSettingsService.class);
        AiInvocationGateway gateway = mock(AiInvocationGateway.class);
        ChatAgentModelAdapterFactory adapterFactory = mock(ChatAgentModelAdapterFactory.class);
        ChatReadTools tools = mock(ChatReadTools.class);
        ChatReadTools.ReadScope readScope = mock(ChatReadTools.ReadScope.class);
        AiTaskScope taskScope = mock(AiTaskScope.class);
        ChatAgentModelAdapter adapter = mock(ChatAgentModelAdapter.class);
        mapRequestsWithActualMapper(adapter);
        AiSettingsService.ResolvedSettings resolved = new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK,
                "test-model", new AiCredential(endpoint, "synthetic-key"), AiCredentialSource.PLATFORM);
        when(persistence.claim(userId, conversationId, runId, attemptId, 1L))
                .thenReturn(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        when(persistence.executionProfile(userId, conversationId, runId))
                .thenReturn(new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK, "test-model", endpointHash));
        when(persistence.activityForSubmissionRun(runId, userId)).thenReturn(activity);
        when(persistence.requireRun(userId, conversationId, originalRunId)).thenReturn(sourceRun);
        when(persistence.finish(eq(userId), eq(conversationId), eq(runId), eq(attemptId), eq(1L), anyMap(),
                anyString(), anyString(), anyString(), anyLong(), anyString(), anyString(), any()))
                .thenAnswer(invocation -> new ChatRuntimePersistenceService.Terminal(run, attempt, replyId));
        when(settings.resolve(userId, AiProviderType.DEEPSEEK)).thenReturn(resolved);
        when(tools.begin(eq(userId), any())).thenReturn(readScope);
        when(tools.sdkDefinitions()).thenReturn(List.of());
        when(readScope.revisionSnapshot()).thenReturn(Map.of());
        when(gateway.beginTask(any())).thenReturn(taskScope);
        when(adapterFactory.create(any(), eq(taskScope), any())).thenReturn(adapter);
        when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(conversationId, "Chat",
                List.<MessageView>of(), Instant.now(), Instant.now(), null, 0L, (short) 1, true, null, com.auralis.app.ai.ChatConversationScopeState.UNBOUND, null));
        when(messages.findById(userMessageId)).thenReturn(Optional.of(userMessage));
        AtomicReference<ChatRequest> capturedRequest = new AtomicReference<>();
        doAnswer(invocation -> {
            capturedRequest.set(invocation.getArgument(0));
            StreamingChatResponseHandler handler = invocation.getArgument(1);
            handler.onPartialResponse(new PartialResponse("Answer considered from the provided question."),
                    mock(PartialResponseContext.class));
            handler.onCompleteResponse(dev.langchain4j.model.chat.response.ChatResponse.builder()
                    .aiMessage(AiMessage.from("Answer considered from the provided question."))
                    .finishReason(FinishReason.STOP).build());
            return null;
        }).when(adapter).chatWithRawCapture(any(ChatRequest.class), any(StreamingChatResponseHandler.class),
                any(java.util.function.Consumer.class), any(java.util.function.Consumer.class));

        ChatAgentOrchestrator orchestrator = new ChatAgentOrchestrator(persistence, conversations, messages, settings,
                gateway, adapterFactory, ChatAgentProperties.defaults(), tools, mock(AiUsageQueryService.class),
                new ObjectMapper(), runtimeProperties());
        orchestrator.executeAdmission(userId,
                new ChatRuntimePersistenceService.Admission(run, attempt, userMessageId, false),
                "submit-request", null, ignored -> {});

        String requestMessages = capturedRequest.get().messages().toString();
        assertThat(requestMessages).contains("Choose the correct item", "First", "Second",
                "No private reference was provided", "Judge the submitted answer from the question and options",
                "My answer is B");
        verify(adapter).chatWithRawCapture(any(ChatRequest.class), any(StreamingChatResponseHandler.class),
                any(java.util.function.Consumer.class), any(java.util.function.Consumer.class));
    }

    private void mapRequestsWithActualMapper(ChatAgentModelAdapter adapter) {
        AiChatRequestMapper requestMapper = new AiChatRequestMapper(new ObjectMapper());
        when(adapter.mapRequest(any(ChatRequest.class), anyMap())).thenAnswer(invocation ->
                requestMapper.toProviderRequest(invocation.getArgument(0), "test-model", 256,
                        invocation.getArgument(1)));
    }

    private AuralisProperties runtimeProperties() {
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.maxPromptChars()).thenReturn(50_000);
        return properties;
    }
}
