# Chat Agent 与流式可视化教学重写计划

> **历史计划，已由 [2026-10-31 Chat Agent Display Tool 重写实施计划](2026-10-31-chat-display-tools.md)替代。** 本文其余内容只记录 2026-10-29 当时的决策和状态；不作为当前生成协议、runtime 字段、事件或验收事实。当前唯一字段契约见[Chat Runtime API — Display Tool protocol](../contracts/chat-runtime-api.md)。

当前源码候选的 SYSTEM prompt 还需指导模型按教学内容选择组件：明确的可视化请求优先；流程用 steps、同维度比较用 compare、依赖阶段用 roadmap；chart 使用用户给定或已收到证据支持的数值，假设示例须明确标注；quiz/question 仅在适合的理解检查中使用并放在末尾。复杂解释通常选择一至两种有用结构，不强迫简短答复使用组件，避免重复呈现。此规则是提示而非执行保证，不改变既有组件 schema 或循环控制流。

日期：2026-10-29（Asia/Hong_Kong）

状态：Chat 需求、消费点、运行/API/事件/存储/事务/账务/恢复契约已冻结；Server Chat runtime、profile admission、V42 和候选测试源码已落地。首次全量 Maven 940 tests / 2 failures / 58 errors / 7 skipped，exit 1，主要受隔离 PG URL 与 Docker 缺失限制；旧 fixture 和 migration expected version 已修，目标回归18/18通过，OpenAPI artifact 官方导出/比较15/15通过。review 提出的来源失效时先公开 chunk 问题已修复；受影响 Chat 回归18/18通过，最终 `-DskipTests package` exit 0，review最终B0/I0/O0。全量未通过，PG integration 仍待具备隔离服务后独立验证。稳定 `langchain4j-core:1.22.0` 与 Boot 4.1.0/Jackson 3.1.4 的隔离兼容探针通过 5/5；Server 纯 parser 单元 15/15，PC 内容投影/组件基础 type-check exit 0、Node 测试 6/6。P1 PC 基础已提交，但 Workspace/Store/新 SSE 全面接线和 GUI 由用户接手，本任务不改前端源码。当前服务端字段级候选契约见[Chat Runtime API](../contracts/chat-runtime-api.md)；`API.md`、`Database.md`、OpenAPI artifact 已同步候选契约，生成端类型仍待用户完成前端后生成。证据 `D:/Temp/auralis-chat-p2-validation-20261029/` 与 `D:/Temp/auralis-chat-p2-final-review-20261029/review.md`；不代表 PostgreSQL、真实 Provider、部署、跨端或 GUI 验收。

2026-10-29 后续验证更新：针对 6 项后端 IMPORTANT 的代码、行为测试完成。focused clean/test 为 6 suites、21/21、0 failures/errors/skips，随后 `-DskipTests package` exit 0；只读差量 review B0/I0/O0。具体修复和验证边界见本计划 P2/P4、[Backend](../modules/Backend.md) 与 [Issues](../current/IssuesAndReview.md)。首次全量仍失败且 PG integration 未运行；不代表生产迁移、真实 Provider、部署或客户端/GUI 验收。

执行分支：`feat/pc-chat-frontend`。工作区：`D:/CodeBase/CodexWorktree/chat-agent-rewrite/Auralis`。本轮开始时基线 `6de8d3a`；并行改动不自动归入 Chat 交付。不得把当前未提交 PC/Mobile/Tablet 草稿算作本任务验收结果。

范围：在现有仓库和业务基础上，直接重写 PC Tauri Chat 与 Server ai Chat 实现；所有调用该 Chat 契约的客户端完成必要接线。事实依据为当前源码、[PC 模块](../modules/FrontendPC.md)、[后端模块](../modules/Backend.md)、[API](../contracts/API.md)、[Database](../contracts/Database.md)。下文接口、对象与事件均为拟新增，不代表现有能力。

## 1. 目标、范围与完成定义

通过 LangChain4j 单 Agent Loop 提供轻量资料教学：模型按需搜索、读取原文、大纲，输出自然语言、步骤、对比、路线、图表、单/多选和开放问答卡；用户作答转为关联原题的消息，模型自主反馈和继续教学。

- 普通文字逐字显示；组件中的标题、项目、选项和图表数据按完整 NDJSON 行逐项显示。
- 过渡说明、工具胶囊和教学内容按时间线排列，避免预判或事后搬移文本。
- 题卡只是输入入口。程序验证提交合法性，不判分、不写正确率或掌握状态；LLM 在下一条回复中点评。
- 保存对话、组件、题目和作答以便展示与恢复。填空、学习进度/完成率/步骤推进、知识块完成闭环不进入本计划。
- Overview、Review、核心 Sync 保持当前行为。Mobile/Tablet 不新增可视化教学 UI，但凡消费 Chat 契约的接口、类型和文本投影需要一起更新，不能以保留旧后端执行链来维持调用。
- 完成定义：真实 PC 中可以查资料、逐字/逐项展示、提交两类题卡、由 AI 接续回答，刷新可恢复已保存题卡与作答；异常可局部显示并安全结束执行。源码、自动验证、部署、真实 Provider 和 GUI 验收分别记录。

本计划接替 2026-10-16 学习 Agent 文档的 Chat 产品范围与实施入口。已实现的 Overview 身份/来源、统一预算仍为可复用基础，不能误报为本功能已实施。

### 重写边界

- 直接替换当前 Chat 的固定检索→一次 completion、Prompt 拼装、流式 reducer/Store 与聊天展示接线。可以重组或删除 Chat 专属代码，不以 frozen 或最小补丁约束保留已授权替换的实现。
- 新 Agent Loop 和新消息/组件协议作为唯一现行 Chat 路径；功能重写不做旧版本兼容。完成切换后删除旧专属执行分支、旧接口/字段/配置/缓存读取路径、旧协议适配、fallback、自动格式转换、双读双写、feature flag 双轨及不再使用的测试/文档，所有调用端同步到新契约。
- 在现有入口与模块内完成重写，不复制一套并行 Chat 产品或通过新会话用途长期保留旧流程。实际路由和内部类名按新契约定稿。
- 复用现有用户、学科、资料、Conversation/Message 身份以及鉴权、安全出站、统一用量治理等业务基础。共有能力可做必要适配，但不能为 Chat 绕开或重写无关功能。
- 旧 Chat 数据保留不代表兼容旧格式。新运行链路只读取现行 schema，不通过旧记录纯文本投影、格式探测或自动转换维持旧版本可用；相关模块/契约与状态文档明确旧数据留存及不可用范围，需要显式迁移时单独定义执行方式。新结构通过追加迁移建立，不能伪造题卡/工具记录。删除业务数据或部署另按明确授权执行。

## 2. 当前实现与必要差量

| 当前源码事实 | 实施含义 |
| --- | --- |
| `Auralis-Server/pom.xml` 无 LangChain4j 依赖 | 先核实版本与 Java 21 / Boot 4 / Jackson 3 的兼容性，锁定依赖；不能照搬旧计划的 starter |
| `AiStreamingService` 固定检索、拼 prompt、一次 completion | 直接改写为有界工具循环；复用所依赖的身份与治理能力，不保留旧执行分支 |
| `AiProviderRequest.Message` 只有 role/content，`AiMessageRole` 无 TOOL，`AiProviderChunk` 无工具增量 | 必须增加受治理的工具消息/流式适配；单加 SDK 无法接通 |
| `OpenAiCompatibleProvider` 当前仅传 role/content、读取 delta.content | 在 Chat 适配中承载 tool definitions、call ID、参数、结果及 finish/usage，不改变 Overview 正文协议 |
| `ProviderHttpClient.postStream` 没有可供 Chat 使用的显式取消句柄 | 新增 Chat 流的取消传播和实际退出证据；停止 UI 不等于 Provider 停止 |
| `AiOperationPolicyResolver` 的 CHAT_TURN 对 completion stage 限 1，既有 LEARNING 策略也不支持任意 Loop | 新增受信任的 Chat Agent 操作用途和明确策略；不能只提高总 calls 或绕过 Guard |
| `ConversationService.reserveUserMessage` 仅短事务锁定，不覆盖整个生成期 | 新增原子执行占位和所有权/fence，保护跨请求与跨实例互斥 |
| `MessageEntity` 没有组件、题卡、submission、attempt 和工具记录 | 在现有 Conversation/Message 之上补最小持久记录，复用 owner、消息顺序与精确回复关系 |
| PC `aiStreamReducer` 聚合单个 content，Workspace 用 `renderMarkdown` 渲染 | 在消息边界加入有序片段/组件渲染，不重构整个 Workspace |
| PC Workspace 换文件/卸载时调用 endActiveSession 并最终 deleteSession；服务端 cleanupInactive 有 24h 截止，但当前 Java 生产代码中未找到 scheduler/caller（仅服务方法与测试直接调用） | 实际运行删除路径是 PC；重写后同一有效 Chat 不随文件/页面生命周期删除，目标不增加 TTL 清理 |
| `useChatStore` 有离线 PENDING 自动重放 | 新 Agent 请求和题卡提交必须显式区分网络幂等重送、用户重试与自动收费重放 |

以上为 2026-10-29 只读核对，不代表本轮运行测试或真实 Provider 验证。

### P0 消费点盘点（只读核对，源码基线 20b5c87）

| 范围 | 当前入口与证据 | 本次重写的消费点 |
| --- | --- | --- |
| Server 路由 | `Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java:100-151`：会话列表/创建/详情/删除及 `POST /api/ai/messages/stream`；同一 controller 的 settings、suggestions、usage、Overview 等非 Chat 能力保留 | 保留认证 SSE 入口路径，切换为新 Chat DTO/事件；不为 Chat 保留旧 DTO/event fallback |
| Server Chat 执行/会话 | `AiStreamingService.java:58-265`；`ConversationService.java` 的 list/get/reserve/append；`ReadingConversationCleanupService.java:15-37` | 旧固定检索→单次 completion Chat 执行链被新 Loop 替换；Conversation/Message owner、顺序、精确回复身份共用并补充快照/组件持久化。24h cleanup 当前没有生产调用者 |
| PC transport/reducer | `Auralis-PC/src/api/aiClient.ts:78-124`、`src/api/sse.ts:18-24,50-`、`src/services/aiStreamController.ts:27-65`、`src/services/aiStreamReducer.ts:20-34` | 继续调用同一 Chat 路由；改为新请求/事件类型与有序 segment reducer，保留共用 SSE framing |
| PC Store/页面 | `Auralis-PC/src/store/useChatStore.ts:213-240,440-478,492-534`；`src/views/SubjectWorkspace/index.vue:842-944,1728-1740,2763-2916,2942,3163` | Store 与 Workspace Chat 范围切换到新消息/组件/题卡/快照；修正换文件和卸载时删除会话，并将离线未提交内容限定为草稿 |
| Mobile Chat | `Auralis-Mobile/src/api/aiClient.ts:126,193-230`；`src/pages/mobile/ai-search/index.vue:446` | 删除进程内 user→conversation Map；Chat 调用必须持有显式 conversationId；消费公开文本投影 |
| Tablet Chat/历史 | `Auralis-Mobile/src/pages/tablet/ai-search/index.vue:291-315,473`；`src/pages/tablet/workspace/index.vue:1484-1499` | 流式 Chat 改为新契约；历史列表选中会话后用 conversation detail/snapshot 读消息，不能把 message-less list 当历史正文 |
| 非 Chat 单次文本生成 | `Auralis-Mobile/src/api/aiClient.ts:205-215`、`src/store/useSubjectStore.ts:176`、`src/pages/tablet/workspace/index.vue:1691-1705` | extraction/JSON formatting/handwriting Markdown 和 Tablet summary 从 Chat Loop 移出，使用独立 one-shot text generation 操作 |

实际旧消费点不含新增组件 UI；Mobile/Tablet 以文本能力为主。Server 会话 list 当前不含 messages，详情才读取有序消息；PC Workspace 当前没有从详情恢复会话，并在换文件/卸载时结束会话。`cleanupInactive()` 的 24h 是方法内部筛选，不等于生产定时任务。

### 替换、删除与共享复用清单（目标，未实现）

- **原入口直接替换**：Server 的 `POST /api/ai/messages/stream` 只执行新 Chat Loop；PC `aiClient / SSE types / controller / reducer / useChatStore / SubjectWorkspace` 一起切换；Mobile AI Search、Tablet AI Search 与 Tablet Workspace 的 Chat 调用跟随同一协议。所有 Chat 消息关联显式 `conversationId`。
- **删除旧 Chat 专属路径**：固定检索后单次 completion 的 Chat 分支、旧请求/事件 DTO、旧事件 reducer/字段、Mobile 进程内 `conversationIds` Map、PC 会话换文件/卸载即删的 READING_SESSION 接线，以及 Chat 离线恢复时自动派发 PENDING 收费请求；不转换旧记录、不提供双读、fallback 或 feature-flag 双轨。对应测试迁移到新契约。
- **独立 one-shot operation**：拟新增 `POST /api/ai/text-generations`，只承载摘要/提取/格式化/转写等非对话单次生成。共享认证、用户设置/BYOK、`AiInvocationGateway`、额度/审计与安全 HTTP 出站基础；不复制旧 `AiStreamingService` 的整条 Chat 检索/流式执行链。该 endpoint 与 DTO 尚未实现或进入 API/OpenAPI。
- **保留共享能力**：Conversation/Message owner 与顺序、认证/授权、settings/BYOK/env、`AiInvocationGateway` / `AiUsageGuard`、Provider 安全 HTTP allowlist/DNS pinning、来源 READY/revision 校验、低层 SSE framing；`Overview`、Review、核心 Sync 与非 Chat controller 路由保持现状。Chat 与 one-shot 可共用治理基础，不共享 Chat Loop。
- **运行/存储可恢复性**：Chat 单次执行、题卡提交与回复重试使用同一 Loop。提交是原子保存 submission、关联 USER 消息和回复执行意图；程序只校验结构与归属，不判分、不写正确率/掌握度。刷新取 detail/snapshot；未知派发不自动重跑收费执行。

## 3. 运行架构

```text
PC 输入 / 题卡提交
  → 会话原子准入、请求幂等
  → 上下文构建器
  → LangChain4j 单 Agent Loop
      → 受治理的模型适配器 → 现有 Gateway/Guard/安全 HTTP
      → 授权工具执行器 → 资料公开读取能力
  → Markdown + NDJSON 流式解析
  → 有序 SSE 事件 → PC reducer → 时间线与组件
  → 消息/组件/作答持久化、状态查询、取消与用量结算
```

### 模型与共有执行治理

- 固定依赖为稳定版 `langchain4j-core:1.22.0`，不引入 starter、内置 HTTP client 或隐式 Agent loop。应用通过显式 orchestrator 循环调用模型、处理工具和结束条件；逐 iteration 组装上下文并写入 attempt/iteration 身份，执行权限由当前 owner/conversation fence 校验，模型每次派发都走既有预算 task 和独立 reservation/dispatch/settle。
- 由 LangChain4j 模型接口接入现有 Gateway；按工具与流式语义重写 Chat 请求/事件结构。共有端口按真实调用边界调整，非 Chat 业务仍验证现有约束。隔离兼容探针已证实 core 内部 Jackson2 codec 可与应用 Jackson3.1.4 共存；生产 mapper、Gateway 与 Provider adapter 仍待实现。
- LangChain4j 不自行创建绕过端点 allowlist、DNS pinning、凭据解析、reservation/dispatch/settle 的网络请求。
- 每次 completion 和检索 embedding 均属于当前执行的同一治理 task；工具循环不重置额度、deadline 或并发计数。每次 iteration 都以当前 conversation/run/attempt fence 和该治理 task 的额度账本为准，不以 SDK 隐式循环代替应用记录。平台/BYOK 来源继续逐调用确认。
- 工具 schema、历史和工具结果计入真实序列化请求的容量评估，不仅计算用户正文。
- 禁止框架默认重试在应用不知情的情况下重复派发；所有实际重试要有 attempt 和 reservation 证据。
- P0 冻结 Chat Agent 的循环、completion/embedding 次数、Token、时间、行/块/工具结果大小等配置含义；数值集中确定，不在组件内散落魔法数字。
- Provider 不支持工具调用或目标版本的取消/usage 能力时明确返回能力错误，不默默降级成另一套生成流程。

### 迭代、工具流与业务/账务状态

- 应用显式控制每次 completion → 工具执行 → 下一 iteration 的循环。iteration 开始前确定性构造模型上下文；每次写消息、片段、工具 trace 或终态都验证 run/attempt/conversation fence。单个预算 task 覆盖本轮的全部模型/embedding 调用，但每次模型调用保留独立 reservation 与真实 usage。
- 按 provider response 中的 tool call `index` 聚合增量，同一响应中的每个调用分别累积 `id`、`name` 和 `arguments`，并绑定响应与顺序；text delta 独立交给 Markdown/组件 parser。不得把零散 arguments 当成可执行参数。
- 只有正常、有效的 tool-call 终止响应且所有聚合调用的 ID/name/完整参数均通过 schema 和授权校验后，才逐项执行工具。异常 EOF、连接中断或 cancel 即使已有部分 tool delta，也不得执行；完成与错误终止不可混淆。
- 对照现行 `AiUsageGuard` / `AiUsageGatewayService`：dispatch 后缺失或不完整 Provider usage 不表示 0，正常成功 settlement 仅在完整 usage 时按实际 token 结算，否则沿既有 `estimated_input_tokens + reserved_output_tokens` 保守收费；失败且已派发按现有保守规则收费，未派发才可释放 reservation。不得用输入/输出字符数填入实际 token，也不得以题卡/业务完成释放已派发费用。
- 业务运行态（如题卡已 READY、回复或迭代正常结束）与 reservation settlement/账务可接受性分开持久化。只有当前 owner/fence 校验成功并已原子持久化 READY 的题卡，后续服务端主动取消和保守结算才不能倒改成业务 FAILED。若 `settleSuccessful.accepted=false` 表示 task/execution lease 或 owner/fence 已失效，且 READY 尚未原子保存，则不得忽略拒绝或发布 READY。结算异常不能覆盖已经持久化的业务终态；分别记录 safe accounting error、真实 usage 缺失和业务终态，query 返回持久快照中的真实状态。执行互斥仅在模型/工具 worker 实际退出、取消已确认退出或异常终止已收敛后释放；停止展示/断开 SSE 不构成 worker 已退出的证据。
- 代码路径核对：`AiUsageGuard.java:262-295,299-332,644-649` 实现 settlement 与缺失 usage 保守计费；`AiUsageGatewayService.java:287-322` 在 dispatch/调用后结算并对不接受的 settlement 抛限额异常；当前 `AiStreamingService.java:183-229` 将该异常分支映射到消息失败，需在重写时拆开业务终态与账务状态。`AiTaskScope.close()` 调 `guard.closeTask`（`AiUsageGatewayService.java:573-578`），当前 Chat 在 finally 调用（`AiStreamingService.java:225-228`）；新 worker 生命周期应先确认真正退出再 close。

### 资料与历史上下文

- 前置当前问题、选区、授权资料范围、局部轻量目录及相关历史；总量按实际预算评估，不假定整份目录天然很小。
- 现行资料工具为 `search`、`read_source_excerpt` 与 `read_source_overview`。总览工具只读取正式保存且对当前 source revision 有效的 SOURCE 总览，并按 `overviewVersion` 分页返回导航性 Markdown；没有可用总览时继续原文检索，不触发生成。读取仍验证 owner、当前 attempt source scope、READY/active 与 revision；历史 `read_outline` 不做别名或自动转换。
- 原文、生成总览、用户材料区分标识；只为实际提供给模型的证据建立来源，不把检索候选都当成已入模引用。
- 当前轮工具结果保持完整；上一轮优先保留；较早结果按相关性和预算折叠。预算不足时上一轮也可精简。
- 折叠是代码对已保存数据的确定性投影，保留来源/版本/范围/查询锚点及必要摘录，不额外请求模型摘要，也不保证助手已复述全部证据。
- 工具请求/结果 ID、配对和顺序保持接口有效；完整历史与模型上下文分开保存。前缀缓存仅作测量指标。

## 4. 内容协议与事件流

### 模型输出

普通 Markdown 混排 `:::auralis-steps`、`compare`、`roadmap`、`chart`、`quiz`、`question` 等块（后缀拟名）。块内每行一个完整 JSON 对象，独立结束行 `:::` 关闭组件。组件使用有限的声明式字段，前端用现有 Vue 组件和净化后的 Markdown 渲染。

```text
普通讲解逐字出现……
:::auralis-steps
{"type":"meta","title":"请求流程"}
{"type":"item","title":"发起请求","description":"提交问题与资料范围"}
{"type":"item","title":"执行工具","description":"应用校验并读取资料"}
:::
补充讲解……
:::auralis-quiz
{"type":"stem","questionType":"single","question":"谁执行资料工具？"}
{"type":"option","key":"A","text":"模型本身"}
{"type":"option","key":"B","text":"应用服务"}
{"type":"reference","answer":["B"],"explanation":"模型提出请求，应用执行。"}
:::
```

- 单选/多选题有题干、唯一选项 key 和服务端参考行；开放问答卡有问题、输入配置和可选参考要点。参考放块尾，完成保存后才开放提交。
- 参考仅用于后续 LLM 讨论，不作为程序判分依据；正常解析到的 reference 不发送给前端展示/历史/恢复投影。
- 用户可以质疑答案，LLM 可核对原文纠正参考。偶发自然语言提前输出答案属于可接受的教学生成偏差，不设置苛刻保密恢复路径。
- 组件、题目、消息 ID 由应用分配，协议版本在应用侧明确。路线高亮只影响展示。

### P1 块行 schema（规则已冻结；纯 parser 已实现，未接入 Chat 运行链）

每个块仅接受对应白名单字段；未知字段忽略，未知 rowtype 使当前块 INVALID。应用为 block、item、activity 和 message 分配稳定 ID。`reference` 只保存在服务端私有记录，不进入客户端公开投影。

| 块 | 有序 NDJSON 行与约束 |
| --- | --- |
| `steps` / `compare` | 首行 `meta`：`title` 必填，`description` 可选；之后至少一行 `item`：`title` 必填，`description` 可选。 |
| `roadmap` | 同 `steps`；`item` 可额外有 `tag: string`、`current: boolean`，只影响展示。 |
| `chart` | 首行 `meta`：`chartType` 必填且为 `bar` 或 `proportion`，`unit` 可选；之后 `item` 的 `label` 必须非空，`value` 必须有限且非负。`proportion` 的总和须大于 0，不要求等于 100。 |
| `quiz` | 首行 `stem`：`questionType` 为 `single` 或 `multiple`，`question` 非空；之后至少 2 个 `option`，每个 `key` 唯一且 `text` 非空；末行必须为唯一 `reference`，`answer` 为选项 key 数组且不重复，single 恰好 1 项、multiple 至少 1 项，`explanation` 可选；其后不允许再有行。 |
| `question` | 首行 `stem`：`question` 非空，`placeholder` 可选；可无 `reference`，若有则必须是末行；允许 `points: string[]` 或 `answer: string`，`explanation` 可选。 |

单选/多选和开放问答的提交都只是把用户答案组装成关联原题的短 USER 消息交给 LLM；程序只校验协议形状、选项归属和提交幂等性，不判分、不计算正确率或掌握度。此表是 P1 parser/UI 的输入契约。独立 `ChatStreamParser` 和对应 15 项单元测试已实现；parser 尚未接入 Chat 执行、SSE、reducer 或 UI。唯一 reviewer 已复核围栏 info string：实现先识别 delimiter run 再处理 info 字符，tests 250–276 覆盖全部 split，该 IMPORTANT 已关闭。

### 后端到 PC 的事件

复用现有认证 SSE 基础，在 PC 新协议中定义 started、text delta、工具 start/end/error、block start/item/complete/error、activity ready/submitted、终态和安全错误事件（拟名）。每个事件绑定 run/attempt、消息、迭代、片段/块身份及递增序号。

- 文本直接增量显示；项目在完整 JSON 行校验通过后插入。正常文字与组件不能重新排序。
- 每次模型迭代保留独立片段身份，同一助手回复关联所有文本和工具胶囊。前端不按“稍后是否调用工具”搬移已显示内容。
- 工具状态来自真实调用，不伪造固定耗时或数量；可见过渡说明照常显示，不依赖内部推理。
- 用户切账号/学科/会话后的迟到事件不能覆盖新上下文。重复或乱序事件按身份和序号处理。
- Chat 统一使用新协议，PC 直接消费时间线和组件。Mobile/Tablet 同步更新契约并按其现有展示能力消费公开文本投影，不能收到私有参考或未经解析的组件缓冲。具体入口与各端响应字段 P0 冻结，不保留旧执行协议协商。

### P0 Chat API、事件和公开投影（已冻结待实施契约）

- 唯一 Chat body 继续使用 `POST /api/ai/messages/stream`，普通 turn 与题卡提交共享新 DTO：`{protocolVersion:1, action:'turn'|'activity_submission', conversationId, requestId, content?, readingContext?, selectionText?, activityId?, questionVersion?, submissionId?, answer?}`。`conversationId`、非空且最多 128 字符的 `requestId`、`protocolVersion=1` 必填；action-specific 字段按白名单校验。新会话是用户显式操作，先调用现有 create，再使用返回 ID；不允许服务端在 stream 内隐式创建。旧字段/旧事件不协商、不 fallback。
- Activity submission 的 `answer` 对齐已提交 PC canonical type：open question 为原始 `string`，single/multi choice 为 `string[]` option keys；不接受对象包装。客户端不发题干、reference、参考答案或解释。服务端根据 activityId/questionVersion 重建题目并只校验题型、选项归属、长度与单次提交幂等，不判分、不写学习进度。
- retry/status/cancel 独立路由：`POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts`，body `{requestId}`；`GET /api/ai/conversations/{conversationId}/runs/{runId}`；`POST /api/ai/conversations/{conversationId}/runs/{runId}/cancel`。详情仍由 `GET /api/ai/conversations/{conversationId}` 返回完整有序公开 snapshot；列表继续仅作目录。状态/重试/取消均 owner-scoped。
- Status 响应固定字段：`{protocolVersion,conversationId,runId,requestId,userMessageId,currentAttemptId,currentReplyMessageId,status,fenceVersion,executionActive,accountingSummary,publicSnapshot,toolTrace,createdAt,updatedAt,attempts:[{attemptId,attemptNo,requestId,status,replyMessageId,createdAt,startedAt,endedAt,safeErrorCode}]}`。Conversation detail 顶层 `activeRun` 含 run/attempt 身份、status、executionActive、当前 publicSnapshot/toolTrace。`replyMessageId` 可在 attempt 尚未落 message 时表示其预分配 UUID；run 级 `accountingSummary` 由稳定 `budgetTaskId` 对应的现有 reservation ledger 汇总，覆盖所有 retries，只公开当前用户的本 run 数值，不复制账本行或 token 原始请求。
- one-shot 文本能力使用独立 `POST /api/ai/text-generations`，请求 `{operation,input,requestId?}`、响应 `{text}`；白名单覆盖 summary、extract/JSON、format Markdown 与现有 transcript/text 生成。它复用认证、设置/BYOK、Gateway 和安全传输，不进入 Chat loop。Overview 两条 route 与行为保持不变。
- SSE envelope 固定为 `{protocolVersion,conversationId,requestId,runId,attemptId,userMessageId,replyMessageId,iterationId?,blockId?,sequence,event,payload}`。运行/attempt/message/iteration/block/activity 身份由服务端生成，只有 requestId 来自客户端。`sequence` 在同 attempt 内严格递增；retry 是新 attempt，sequence 可重新从 1 开始，由 attemptId 区分。事件为 `run.started`, `reasoning.delta`, `text.delta`, `tool.started`, `tool.completed`, `tool.error`, `block.started`, `block.item`, `block.completed`, `block.error`, `activity.ready`, `activity.submitted`, `run.completed`, `run.failed`, `run.cancelled`, `run.unknown`。reasoning 和 tool events 属于同一过程区；`reasoning.delta` 只转发 Provider 明确返回的 `delta.reasoning_content` 字符串，不进正文/parser/Markdown parts。正文文本继续使用 `text.delta`。结构事件只发布完整、成功解析并校验的 NDJSON 行。
- `messages.content` 是服务端从公开有序 parts 确定性生成的 Markdown 投影；结构 parts 保存在对应 `chat_attempts.public_parts_json`，每条 Assistant message 通过 attempt.replyMessageId 精确关联自己的 snapshot。PC 展示结构化 segment；Mobile/Tablet 只读相同 segment 的服务端 `publicTextProjection`。raw NDJSON、private reference、answer/explanation、私有工具证据不进入任何公开 DTO、SSE、detail/history、错误消息或日志。
- Chat 与 Overview thinking 使用独立环境配置 `AURALIS_AI_CHAT_THINKING_ENABLED`（默认 true，仅 `CHAT_AGENT_TURN`）与 `AURALIS_AI_OVERVIEW_THINKING_ENABLED`（默认 false，覆盖 Source/Subject Overview 所有 provider completion stages）。可信 operation/feature 在 Gateway 中注入不可变 request 选项；旧全局开关继续作用于其它既有调用。仅 DeepSeek 与精确 host `api.xiaomimimo.com` 支持的请求会携带 thinking 字段，其他 provider 不发送猜测字段。
- 开启 thinking 的 tool iteration 将 Provider 的显式 reasoning 以独立事件流给过程区，并保留同 iteration assistant reasoning/tool-call 配对供后续工具请求回传。跨 run 的配对文本仅存既有 `private_tool_evidence_json`，不进公开消息、toolTrace 或日志。旧/缺 reasoning 的历史工具证据作为明确标记的中性事实数据投影，不伪造 reasoning，也不发孤立 tool-call/result。工具执行仍由显式 loop、合法 terminal、服务器工具 allowlist、完整参数校验与现有 owner/source/fence 检查控制。
- `chat_activities.private_reference_json` 只允许内部服务读取；响应必须通过显式 DTO mapper，不能自动序列化 Entity。题卡公开题干/选项/placeholder 与 private reference 原子保存。自然语言在 reference 前提前泄露答案仍按已接受的生成偏差处理。
- 会话和消息版本：`conversations.chat_protocol_version SMALLINT NULL`，仅新建 Chat conversation 写 `1`；`messages.chat_protocol_version SMALLINT NULL`，新 Chat USER 与每个 attempt 的 ASSISTANT message 写 `1`。历史行保持 NULL，不回填。Chat list 可返回目录元数据并将 NULL/未知会话标记 `chatSupported=false`；detail 只有 conversation version=1 且其中每条 Chat message version=1 才返回公开 snapshot，否则返回 `CHAT_PROTOCOL_UNSUPPORTED`，不给旧 content-only message 做兼容展示或执行。旧数据保留，用户可新建当前协议会话。

### 流式解析与宽松恢复

- 状态包括正文、普通代码围栏、组件、已结束。跨网络 chunk 保留必要前缀，不把 chunk 当完整行。
- 维护反引号/波浪号围栏字符与长度，按 Markdown 规则匹配；普通代码围栏内所有 Auralis 标记均为代码。
- 仅在允许的独立行识别组件边界；组件内 JSON 字符串中的围栏、换行转义和 `:::` 不切换状态。
- 已完成 JSON 行解析、按块类型校验后，只发布公开字段；reference 正常转存私有记录。未知字段不作为任意 HTML/脚本执行。
- 坏 JSON 原始缓冲不回吐正文；发送 block error。遇到明显普通正文时允许关闭异常组件并恢复正文展示。偶发答案提前出现可接受，不因此隔离整段后文。
- 异常组件保留已显示有效项目并标记异常；题目缺必要内容则不可提交。不静默补造题目或答案。
- 行内中文、Markdown、代码与公式用序列化和既有 sanitizer 处理；长度/资源超限安全终止当前单元，不能无限缓存。

## 5. 题卡、提交与回复

### 生命周期与自动衔接

- 题卡展示状态：GENERATING / READY / SUBMITTED / INVALID。已提交显示选项或文本，不染对错颜色、不显示程序分数。
- 首版采用单次提交；同题的新 submissionId 再次提交返回已提交状态或明确冲突。网络重送同 submissionId 同内容回放，内容不同则拒绝。
- 用户草稿、选项在本地保留，只有提交成功才标记 SUBMITTED。
- 一次提交关联 questionId、questionVersion、submissionId、用户答案和可见摘要。不存在新的学习目标/步骤表。
- 提交成功后自动创建关联原题的用户消息和回复执行；模型负责点评、补讲、追问或继续，不增加“请先判分”的专用协议。
- UI 可由题卡显示用户输入，不再重复显示含原题/参考的长气泡；服务端仍保留与现有 assistant→USER 精确回复一致的稳定用户消息身份。

### 模型上下文边界

- 应用从服务端题目重建原题/选项，客户端只提交题目身份和答案，不信任客户端重传的参考内容。
- 原题、真实用户答案、服务端参考分区并标注来源。统一序列化/转义，禁止裸拼 XML 或把参考伪装成用户发言。
- 固定系统规则说明数据分区不是指令，参考可能有误；XML 标签本身不提供角色或权限隔离。
- 历史题卡提交时同时带当前相关对话；过期/删除/越权资料不能作为新检索授权，保留的历史题意按明确来源状态使用。

### 回合结束与重试

- READY 题卡在结束行完整解析和校验后，先用短事务核对当前 owner/fence 并原子保存公开题目与 private reference；事务提交后关闭本轮公开输出和新工具执行，再发 `activity.ready` 并请求取消底层生成。READY 的业务成功不等待后续账务状态；READY 写入前 owner/fence 失效时必须拒绝发布。
- 题卡只是本轮输出断点，不锁其它会话。历史 READY 题卡在有效会话中可稍后提交。
- Run、attempt 的业务状态独立于 Guard reservation/usage 账务状态。缺失/不完整 usage 继续按完整 reservation 保守结算，不能记 0 或用字符数冒充 token。Activity READY 或已保存的 Assistant message 不因 settlement `accepted=false`、未知 usage 或后续账务异常回滚；READY 前失去 owner/fence 则不发布。
- 每个 attempt 有唯一 `replyMessageId`，每次显式 retry 创建新 attemptId 和新助手消息；stable USER messageId、runId 和原 submission 不变。旧 attempt 的 partial assistant message、公开 parts 与费用保留，不以相同 reply ID upsert 覆盖。重复 requestId 同 payload 只回放状态；同 requestId 改 payload 返回 409。
- PENDING attempt 尚未经过 Provider dispatch 前的数据库 claim；启动恢复只终结过期 PENDING，释放 slot，不自动重派，随后由用户显式 retry。新实例遇到仍在持久化 attempt deadline 内的 foreign PENDING/RUNNING/CANCEL_REQUESTED 不干扰；超期 foreign RUNNING/CANCEL_REQUESTED 被 fencing 为 UNKNOWN 并继续占 slot，等人工可审计恢复，不自动重派。显式 retry 与 claim 在同一 Conversation→run→attempt 锁序竞争，只有一方胜出。
- 取消请求只有请求态；本机 worker 通过持久 cancelRequested 轮询观察跨实例取消，并等待 LangChain4j handle、受治理 HTTP reader 和工具 worker 确认退出并 join 后，才 terminalize、关闭 AiTaskScope 并释放 Conversation slot。断开 SSE 只触发取消，不等于 worker 退出。
- READY 后 settlement 被拒绝只更新 accounting 观察结果，不覆盖业务成功。attempt 在 READY 或 final message 持久化之前丢失 owner/fence 时拒绝发布；费用仍依据 reservation 保守结算。

## 6. 会话、持久化、互斥与清理

### 会话保留

以下均为待实施设计，API.md / Database.md 继续只描述现行已实现能力；本计划是 P0 新契约的唯一权威。新会话仍是显式用户操作，并受全局/用户 Guard 并发与额度限制。

- PC 当前会话选择以认证用户 + subject 为键保存在 PC 本地；它只是 UI 恢复映射，不是服务端鉴权依据。切换当前文件只改变本轮 `readingContext`，不创建另一条 Chat，也不删除会话。页面卸载、换学科前的组件清理只停止当前 UI 工作，不删服务端历史。
- 不新建 `VISUAL_CHAT` 双轨 purpose、不引入全局学习目标/进度/掌握度。复用现有 Conversation/Message 语义，允许现有 purpose metadata 仅服务历史展示；具体列表筛选需按当前消费端核对。
- 24h 是 `ReadingConversationCleanupService.cleanupInactive()` 的方法内截止条件；只读搜索没有找到生产 scheduler/caller，测试会直接调用该方法。当前实际运行删除由 PC `SubjectWorkspace/index.vue:1728-1740,2942,3163` 调 `endActiveSession`，再由 `useChatStore.ts:492-534` 调 `deleteConversation` 并 tombstone 本地记录。该删除行为在新 Chat 中移除。
- 刷新/重登使用相同显式 conversationId 和 detail/status snapshot。会话列表可展示旧行元数据并标记 `chatSupported=false`，不返回其旧消息正文或允许继续；detail 对 NULL/未知协议返回 `CHAT_PROTOCOL_UNSUPPORTED`。Tablet 选历史会话必须重新取 detail。Mobile/Tablet 命令始终显式带 conversationId；删除进程内 user→conversation map。PC 本地 owner+subject 映射不是服务端授权依据。
- No automatic 24h/TTL deletion. Only explicit user deletion and existing account/resource lifecycle can remove data. Old rows remain in place without auto conversion or content-only fallback. `conversations.chat_protocol_version IS NULL` or unsupported versions return `CHAT_PROTOCOL_UNSUPPORTED` from Chat list/detail and cannot continue in the new Chat path. New conversations set version 1; new USER and ASSISTANT messages set message version 1. No old data is deleted or backfilled.
- Offline state contains drafts only; reconnect never creates/dispatches a paid Chat command. The user explicitly resubmits. Unknown dispatch is never retried automatically.

### 持久表与 V42/V43 迁移差量（源码落地，production migration 未验证）

当前 Flyway latest 基线为 V41。源码追加 `V42__chat_agent_runtime.sql` 与 `V43__chat_private_tool_evidence.sql`，不修改既有迁移。`API.md`、`Database.md` 登记源码候选契约，不代表已在业务库应用；OpenAPI artifact 和生成端类型仍需按客户端实现状态更新。V43 新增 `chat_attempts.private_tool_evidence_json TEXT NOT NULL DEFAULT '[]'`，保存工具结果/source revision 和 thinking tool protocol 必需的 reasoning/tool-call 配对供后续模型上下文使用，不经公共 DTO、status/detail/trace 暴露。结构 JSON 列使用 TEXT 存储序列化 UTF-8 JSON；不进入 Sync、change_log、snapshot mutation 或客户端写模型。

**既有表差量**

- `conversations` 新增 `chat_protocol_version SMALLINT NULL`、`active_chat_run_id UUID NULL`、`chat_fence BIGINT NOT NULL DEFAULT 0 CHECK(chat_fence >= 0)`。新建会话由应用写 `chat_protocol_version=1`；旧行 NULL。`active_chat_run_id` 不加 FK（与 chat_runs 双向生命周期循环），只允许在锁定该 conversation 行的事务内设置/清除；运行占位通过行锁和 fence 维护。
- `messages` 新增 `chat_protocol_version SMALLINT NULL CHECK(chat_protocol_version IS NULL OR chat_protocol_version=1)`。旧行不回填。`content` 始终是面向客户端的 Markdown 投影；每 attempt 的结构 parts 独立放在 `chat_attempts.public_parts_json`。每个 attempt 插入自己的 ASSISTANT message，`reply_to_message_id` 指向稳定 USER message；不同 retry 不共用/覆盖 message ID。
- `conversations.chat_protocol_version` 允许 NULL 或 1；Chat 新建时由服务显式设 1，而非给 SQL 全局 DEFAULT，避免其它创建用途隐式切换协议。

**新表 `chat_runs`：一条稳定 USER turn / submission 执行意图**

列：`id UUID PRIMARY KEY`, `user_id UUID NOT NULL`, `conversation_id UUID NOT NULL`, `request_id VARCHAR(128) NOT NULL`, `request_hash CHAR(64) NOT NULL`, `request_context_json TEXT NOT NULL`, `action VARCHAR(24) NOT NULL`, `user_message_id UUID NOT NULL`, `current_attempt_id UUID NULL`, `current_reply_message_id UUID NULL`, `budget_task_id UUID NOT NULL`, `status VARCHAR(16) NOT NULL`, `fence_version BIGINT NOT NULL`, `created_at/updated_at TIMESTAMP WITH TIME ZONE NOT NULL`, `completed_at TIMESTAMP WITH TIME ZONE NULL`。

`request_context_json` retains the normalized turn readingContext/selectionText needed by explicit retry; the stable USER message remains the sole stored turn text. Every retry revalidates current owner, subject, source READY/active/revision/generation before using retained context.

约束：`user_id→users(id) ON DELETE CASCADE`; `conversation_id→conversations(id) ON DELETE CASCADE`; `user_message_id→messages(id) ON DELETE CASCADE`; `UNIQUE(user_id,request_id)`, `UNIQUE(user_message_id)`, `UNIQUE(id,user_id)`；action 限 `turn/activity_submission`；status 限 `PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/UNKNOWN`；`fence_version>=0`。`current_attempt_id/current_reply_message_id` 是运行期指针，前者在同一事务插 attempt 后设置，后者可先指向预分配 UUID，均由服务校验归属，不做循环 FK。索引 `(conversation_id,status,updated_at)`。

**新表 `chat_attempts`：每次尝试独立保存回复与输出**

列：`id UUID PRIMARY KEY`, `run_id UUID NOT NULL`, `user_id UUID NOT NULL`, `request_id VARCHAR(128) NOT NULL`, `request_hash CHAR(64) NOT NULL`, `attempt_no INTEGER NOT NULL`, `status VARCHAR(24) NOT NULL`, `worker_instance_id VARCHAR(128) NOT NULL`, `fence_version BIGINT NOT NULL`, `allocated_reply_message_id UUID NOT NULL`, `reply_message_id UUID NULL`, `public_parts_json TEXT NOT NULL`, `tool_trace_json TEXT NOT NULL`, `private_tool_evidence_json TEXT NOT NULL DEFAULT '[]'`, `last_sequence BIGINT NOT NULL DEFAULT 0`, `cancel_requested_at TIMESTAMP WITH TIME ZONE NULL`, `safe_error_code VARCHAR(64) NULL`, `started_at/heartbeat_at TIMESTAMP WITH TIME ZONE NULL`, `deadline_at TIMESTAMP WITH TIME ZONE NOT NULL`, `ended_at TIMESTAMP WITH TIME ZONE NULL`, `created_at/updated_at TIMESTAMP WITH TIME ZONE NOT NULL`。V43 私有工具证据 JSON 可选保存显式 `reasoningContent` 配对，仅供历史模型上下文 projector 读取，不进入公共 DTO。`deadline_at` freezes the effective per-attempt timeout at admission; `created_at` preserves PENDING admission time; `updated_at` tracks later state/checkpoint changes.

约束：`(run_id,user_id)→chat_runs(id,user_id) ON DELETE CASCADE`; `reply_message_id→messages(id) ON DELETE CASCADE`；`UNIQUE(user_id,request_id)`、`UNIQUE(run_id,attempt_no)`、`UNIQUE(allocated_reply_message_id)`、`UNIQUE(reply_message_id)`、`UNIQUE(id,run_id,user_id)`、`CHECK(reply_message_id IS NULL OR reply_message_id=allocated_reply_message_id)`；status 限 `PENDING/RUNNING/CANCEL_REQUESTED/COMPLETED/FAILED/CANCELLED/UNKNOWN`；attempt_no 正数、fence/sequence 非负。`allocated_reply_message_id` 是预分配 ID，不建 FK；只有对应 assistant Message 已插入并经 app 校验 user/conversation/reply-to 后，才写入有 FK 的 `reply_message_id`。索引 `(run_id,attempt_no)`、`(status,heartbeat_at)`。

**新表 `chat_activities`：公开 activity、私有 reference、单次 submission**

列：`id UUID PRIMARY KEY`, `run_id UUID NOT NULL`, `user_id UUID NOT NULL`, `attempt_id UUID NOT NULL`, `message_id UUID NOT NULL`, `block_id UUID NOT NULL`, `question_version INTEGER NOT NULL`, `question_type VARCHAR(16) NOT NULL`, `state VARCHAR(16) NOT NULL`, `public_payload_json TEXT NOT NULL`, `private_reference_json TEXT NULL`, `submission_id UUID NULL`, `answer_hash CHAR(64) NULL`, `answer_json TEXT NULL`, `submission_user_message_id UUID NULL`, `reply_run_id UUID NULL`, `created_at TIMESTAMP WITH TIME ZONE NOT NULL`, `submitted_at TIMESTAMP WITH TIME ZONE NULL`。

约束：`(run_id,user_id)→chat_runs(id,user_id) ON DELETE CASCADE`; `(attempt_id,run_id,user_id)→chat_attempts(id,run_id,user_id) ON DELETE CASCADE`，因此 chat_attempts 增加 `UNIQUE(id,run_id,user_id)`；`user_id→users(id) ON DELETE CASCADE`; `message_id→messages(id) ON DELETE CASCADE`; `submission_user_message_id→messages(id) ON DELETE CASCADE`; `(reply_run_id,user_id)→chat_runs(id,user_id) ON DELETE CASCADE`; `UNIQUE(attempt_id,block_id)`、`UNIQUE(submission_id)`、`UNIQUE(reply_run_id)`；question_type 限 `single/multi/open`；state 限 `READY/SUBMITTED/INVALID`。索引 `(run_id,created_at)`。单次提交的 `submission_id/answer_hash/answer_json/submission_user_message_id/reply_run_id` 与公开题干/选项、private reference 共用一行，不另建 submission 表。重复 submissionId+同答案回放既有关联；不同答案冲突。`public_payload_json` 与 `private_reference_json` 分列且只经白名单 mapper 写读。

删除语义：三个新表都沿 run/conversation/user/message FK cascade；现有 account hard-delete 的 `DELETE messages` 会先级联 run/attempt/activity，随后删除 conversations（`AccountDeletionCleanupService` 顺序不需新增表清理 SQL）。Conversation 用户软删只保留历史，不物理级联。新 Chat 用 GENERAL conversation，不绑定 source_id，Source 删除不级联对话。部署迁移不得清理旧数据。

### 事务、并发、fence 与恢复

所有事务采用同一锁序：`Conversation FOR UPDATE → ChatRun FOR UPDATE（若已存在）→ Activity FOR UPDATE（仅 submission）→ ChatAttempt FOR UPDATE`。不在事务内等待 Provider、工具或 SSE 客户端；消息序号只在 conversation 行锁内递增。跨实例互斥由 PostgreSQL 持久 `active_chat_run_id + chat_fence` 与行锁负责，不以单进程 mutex 替代。

1. **接受普通 turn/activity submission**：鉴权并校验 conversation owner/version；锁 Conversation；先查同用户 requestId。相同 requestHash 返回同 run 状态，不同 hash 409。对 activity_submission，在该 conversation lock 下非锁读取 activity：若已 SUBMITTED，先锁其 reply_run，再锁 Activity，校验 submissionId/answerHash 后回放原回复 run或对不同答案返回 409（即使原 run 仍 active）；若 READY，再检查 active_chat_run_id，非空返回 409 `CHAT_RUN_ACTIVE`。新提交先创建关联 USER message 和 PENDING run（分配 runId、budgetTaskId、requestHash、fence），再锁 Activity 并复核 owner/conversation、READY/questionVersion、答案形状和单次提交，然后插入 PENDING attempt1（分配唯一 reply UUID）并更新 run.currentAttemptId/currentReplyMessageId，最后写 activity submission。普通 turn 先检查 active slot，再在 conversation 锁下写 USER message、PENDING run、PENDING attempt。两种新命令均设置 active_chat_run_id、增加 chat_fence，并在同一短事务提交；任何校验/唯一键失败整体回滚。提交后才启动模型。
2. **worker claim / Provider 调用**：PENDING→RUNNING 使用 owner/current attempt/fence 条件更新，只有一个 worker 可 claim；构造显式 `ChatRunContext`，携带 AiTaskScope、provider/source、取消句柄与 fence，禁止 ThreadLocal。每次模型调用由 adapter 显式通过 Gateway reserve→dispatch→settle；每次 tool call 只在完整合法 Provider terminal 后执行。每次输出/工具写入前复核 owner+fence。
3. **READY 与部分输出检查点**：完整 NDJSON 行合法后在短事务锁同一顺序并核对 fence，把 activity public/private 部分原子写为 READY 后再关闭公开输出、停止后续工具/请求取消。attempt `public_parts_json` 在完整 block/item 边界及每累计 4 KiB 或 1 秒（先到者）以短事务 checkpoint；不逐 token 写库。最终/取消/失败再次 flush，status snapshot 以持久 parts 为准。
4. **terminal 与每次 Assistant Message**：worker/工具线程和 Provider reader 确认退出后，单个短事务按固定锁序检查 active run/fence/current attempt，写当前 attempt 的独立 ASSISTANT Message（ID=allocated_reply_message_id，protocol=1，replyTo 稳定 USER ID，content=该 attempt parts 的 Markdown projection），再写 attempt.reply_message_id、attempt/run terminal、更新 `currentReplyMessageId`、清除 active slot。历史 attempt 的消息和 parts 永不 upsert 覆盖。先前 READY activity 保持 READY，即使之后账务结算拒绝；若保存 READY 前 fence 失效则不发布。
5. **重试**：显式 `POST .../attempts` 先锁 Conversation、run、current attempt；只有 prior attempt FAILED/CANCELLED 且 worker join/reader close 已确认、active slot 可清除时准入。相同 `(user_id,request_id)` 重放只返回既有 attempt；冲突 payload 409。创建 `attempt_no+1`、新 attemptId/new allocated reply ID/currentAttempt/currentReply；保留 stable USER/run/activity/submission和每个旧 Assistant Message；占位与 fence 更新同一事务。
6. **取消**：route 只记录 `cancel_requested_at`/CANCEL_REQUESTED 并通过 run-scoped cancellation 传播到 SDK handle、安全 HTTP reader 和 tool worker。只有 worker 真正退出、工具 join、reservation 按真实或未知 usage settled/保守扣费后才写 CANCELLED 并释放 slot。SSE disconnect 同理。
7. **崩溃/多实例恢复**：PENDING 表示 worker 未 claim/未 dispatch；恢复时确认没有 `request_dispatched=true` reservation 后安全 terminalize FAILED/CANCELLED，slot 仍维持直到该事务确认，再由用户显式 retry。PENDING 自提交起占 slot，防双 claim。RUNNING 若旧 instance/reader 无法被证明已退出，转或保持 UNKNOWN，返回状态并对新 turn/retry 返回 409；仅 lease 到期不能释放、不自动重派。手工恢复须在运维操作审计中确认旧 instance/reader 已隔离并已检查/保守结算全部 reservation；本阶段不造万能 unlock API。每次状态变更提升 fence，旧 worker 的迟到完成更新 0 行并禁止发布。
8. **账务**：一个 logical run 在所有 attempts 间共享 Guard budget task id；每次 completion/embedding 仍各自一条 reservation。dispatch 后 usage 缺失按完整 `estimated_input_tokens + reserved_output_tokens` 保守收费；派发前才可 release。business READY/assistant terminal 与 accounting state 分离，accepted=false 不能覆盖已提交业务成功；READY 前失去 owner/fence 拒绝 publication。

### Guard 与 Chat Agent 配置（待实施）

新增独立不可变 `ChatAgentProperties`，绑定 `auralis.ai.chat-agent`，并贯通 `application.yml`、root Compose、`.env.example`。现行次数配置为 `AURALIS_AI_CHAT_AGENT_MAX_MODEL_CALLS=0`、`AURALIS_AI_CHAT_AGENT_MAX_EMBEDDING_CALLS=0`（0 表示不设次数帽；正数分别限制模型与 embedding；负数拒绝），`AURALIS_AI_CHAT_AGENT_MAX_ITERATIONS=8`、`AURALIS_AI_CHAT_AGENT_MAX_TOOL_CALLS=12`、`AURALIS_AI_CHAT_AGENT_MAX_TOOL_RESULT_UTF8_BYTES=65536`、`AURALIS_AI_CHAT_AGENT_MAX_SERIALIZED_REQUEST_UTF8_BYTES=524288`、`AURALIS_AI_CHAT_AGENT_ATTEMPT_DEADLINE_SECONDS=300`。不再配置或兼容 combined model+embedding 调用帽。两类 Provider 调用由 AiUsageGuard 按 reservation 的 stage 分别准入，platform 与 all-origin stage 使用相同独立限制；Chat task 聚合 call caps 为0，retry 继续共用 run ledger。保留平台 Token task/window 额度、每次调用实际 usage 结算及现有其它 operation 策略。工具次数维持既有 per-attempt 限制；8 次 iteration 仍限制单 attempt 的模型循环，不能据此视为无限运行。run status accountingSummary 显示跨 retry `modelCalls` / `embeddingCalls`，以及当前 attempt trace 内 unique tool call IDs 数。

新增独立 `CHAT_AGENT_TURN` operation kind 和 Chat Agent policy；总 calls=8 覆盖 completion+retrieval embedding，`CHAT_COMPLETION` per-stage cap=8，embedding stage cap 不超过 8 并允许多查询检索。另新增 `TEXT_GENERATION`，feature=`CHAT`、单 completion、无 embedding；用于 one-shot route，不进入 Agent loop。既有 `CHAT_TURN`、`LEARNING_*` 和 Overview operation 默认不改。`AiTaskContext.chatAgentLedgerTaskId(userId,runId)` 只供 `CHAT_AGENT_TURN` 生成稳定 run budgetTaskId；Guard task lock key 使用现有 `userId:feature:taskIdentity` 算法，taskKey 固定为 `chat-agent:<runId>`。ledger UUID 使用与 Overview 命名域隔离的 namespaced 名称 UUID；所有 attempt 使用同一 run ledger task id，因此历史 reservation/charged/reserved 累计，不复制或改写原账本。

容量 admission 对完整实际 UTF-8 序列化请求计入 system/history、tool definitions、tool calls/arguments、tool results 与协议开销；每个完整序列化 tool result 按 64 KiB cap。token estimator 仍按 Gateway 当前策略执行，但不能代替字节 cap。模型工具增量按 `(provider responseId, tool index)` 聚合 id/name/arguments。只有收到明确、正常的 `tool_calls` terminal、所有 call ID 唯一且 name/完整 arguments 均可解析为 JSON object 并通过 schema、owner、source revision 和授权检查后才可执行工具。Text-only `stop` 可正常完成；`length`、`content_filter`、`aborted`、无/未知 finish、malformed terminal、EOF/error/断流/cancel 均不产生 executable call，即使已收到 partial tool delta 也不执行。

LangChain4j 固定 core 1.22.0；显式应用 orchestrator 与 per-run adapter context，不用 `AiServices`、ThreadLocal、内置 Provider transport 或隐式 retry。若所选 adapter/HTTP 层暴露 retry 设置，固定 0；Loop 次数和 retry 全由应用控制并记入同一 Guard task。

### 单会话互斥

- 准入在持久短事务中原子检查并占位。同 requestId 重放优先；不同新请求遇有效执行返回 HTTP 409 / `CHAT_RUN_ACTIVE`，不创建新消息、不预留新费用。
- 不在 Provider I/O 期间持有数据库行锁；跨实例依赖 conversation 行锁、active_chat_run_id 和 fence，不靠单进程 mutex。PENDING 自提交开始就占用 slot。
- 题卡提交事务与新 run 准入同一原子边界，持久化 submission、关联 USER 消息、PENDING attempt、该 attempt 专属预分配 reply ID 和会话占位；模型调用发生在事务结束之后。服务端 query 暴露 pending/终态，用户显式 retry 才能开始新 attempt；无自动队列/自动重派。
- 无服务端消息排队。生成中发送按钮提供停止，题卡提交 disabled；聊天/问答输入及选择草稿保留。
- 停止展示、请求取消、实际 Provider/工具退出和互斥释放分别记录。取消确认后用户手动发送，不自动把草稿变成下一次收费请求。
- 新协议断线后可读取状态/快照，不沿用旧离线队列自动新建收费执行。仅在原 worker/reader 确认退出后释放 slot；未知派发保持 UNKNOWN/409，不因 lease 到期自动重跑或解锁。
- Conversation/Subject/Source 软删、硬删、账号注销和本地缓存清理接现有生命周期；新增记录不得变为孤儿或跨 owner 可读。

## 7. 分阶段任务与文件边界

### P0 接线与契约冻结

- [x] 在 `codex/chat-agent-rewrite` 从 `20b5c87` 基线继续；main 已 fast-forward/push，P1 parser/PC content foundations 已提交至 `6de8d3a`，旧 main 工作副本变化已 stash 备份。
- [x] 盘点 Server、PC、Mobile、Tablet 的实际消费点，以及原入口替换、弃用路径删除和共享治理复用清单；证据见本计划 `P0 消费点盘点`。
- [x] 选定稳定 `langchain4j-core:1.22.0`，不使用 starter、内置 HTTP client 或隐式 `AiServices` Loop；预期使用其内部 Jackson 2 codec，而应用 HTTP/持久化/NDJSON 保持 Jackson 3.1.4，不采用 beta32 Jackson 3 codec、不加静态 mapper bridge、不改 Boot BOM。
- [x] 隔离验证 Boot mapper 共存及 LangChain4j core model/tool/usage/cancel API：`langchain4j-core:1.22.0`、Jackson2 core `2.21.4` 与 Boot Jackson3 `3.1.4` 共存，Boot context 仅有单一应用 Jackson3 mapper，探针 5/5、Maven exit 0；不含 LangChain4j starter、Provider HTTP 或 beta32 codec。详情见 `D:/Temp/auralis-chat-p0-20261029/adapter/reports/report.md`。真实 Provider 与取消到 Auralis HTTP 的映射不在探针证明范围。
- [x] 冻结 Gateway adapter 边界、独立 `CHAT_AGENT_TURN` operation、Chat Agent 集中配置候选与稳定 run budget task；生产 adapter/配置仍待实现，保留现有安全 HTTP 出站路径。
- [x] 冻结唯一 Chat Loop、非 Chat one-shot 分离、逐字正文/逐项 NDJSON、单/多选/开放问答提交与 LLM 衔接、不判分，以及 Mobile/Tablet publicTextProjection 和无旧 fallback 的方向。
- [x] 冻结 PC owner+subject 会话保留、文件切换不删除、Mobile 显式 conversationId、Tablet detail/snapshot 历史恢复、无 TTL、离线不自动收费重放、旧数据保留且无运行时转换的最小产品语义。
- [x] 冻结 P1 块行 schema；当前候选含 `Auralis-Server/src/main/java/com/auralis/app/ai/internal/chat/ChatStreamParser.java` 纯 parser 单元，15 项通过；它尚未接入 Chat 运行链。
- [x] 唯一 reviewer 复核 parser code fence info string：delimiter run 在 info 字符前识别，tests 250–276 覆盖全部 split；原 IMPORTANT 关闭。PC 新增内容基础的实现复核未发现 BLOCKER/IMPORTANT。
- [x] 冻结显式 iteration orchestrator、逐 iteration 上下文与 run/attempt fence、逐模型调用账本；tool delta 按 response/index 聚合且异常 EOF/cancel 不执行；业务终态与账务分离；READY 先原子持久化；模型调用事务外；已冻结完整 DTO/routes/events/schema/迁移/锁顺序/重启与 UNKNOWN hold 契约。
- [x] 冻结每 attempt 独立 replyMessageId 与 Assistant message、旧 partial/history 保留、旧 protocol=NULL 行 unsupported/no fallback、PC owner+subject 本地映射、Attempt deadline 及跨 retry 累计 Guard budget；契约完整内容见本计划 P0/section 6。
- [x] P0 Gateway adapter、Guard operation/config 与 V42 持久化/并发/重启恢复已有候选源码；Maven、migration 与并发集成验证待 P4。

允许目录：本计划、相关设计/产品/架构文档；依赖兼容探针放 D:/Temp，不修改生产实现。P0 设计验收：关键适配与生命周期有具体契约，无依赖“SDK 自动处理”的空白；API/Database/OpenAPI 的实现登记须等 V42 与业务代码落地后再回写。

### P1 流式协议与 PC 渲染纵切

- [x] 实现 Server 纯增量 `ChatStreamParser`；15/15 测试通过，覆盖文字、steps/compare/roadmap/chart/quiz/question 与分片输入。唯一 reviewer 已核对 fence info string，确认 delimiter run 在 info 字符前处理，tests 250–276 覆盖全部 split；原 IMPORTANT 已关闭。parser 仍未接入生产 Chat 流。
- [x] 建立 PC 内容投影与局部渲染基础：新增 `chatContentProjection.ts`、`types/chatContent.ts`、`ChatContentRenderer.vue`、`ChatContentBlock.vue`、`ChatActivityCard.vue` 及 `scripts/r4-chat-content.test.mjs`；type-check exit 0、Node 6/6。投影与题卡纯逻辑已测，组件尚未接入 Workspace/Store/SSE/reducer，无页面挂载或 GUI 验收。证据 `D:/Temp/auralis-chat-p1-components-20261029/`。
- [ ] 将 parser 接入有序事件 reducer / SSE，并用合成流验证跨端时序和稳定公开投影。
- [ ] 将 PC 渲染基础接入消息时间线、reducer、Store 和 Workspace，形成组件容器、题卡草稿及生成/异常/就绪显示；复用既有 Markdown sanitizer、公式/代码渲染和主题。
- [ ] 覆盖逐字/逐项、任意分片、围栏示例、坏行/漏结束、宽松恢复、重复事件和页代际切换。
- [ ] 扩展 compare/roadmap/chart 的行 schema 和组件，图表采用受控数据渲染。

允许目录：Server ai 内协议/解析单元、PC `src/services/aiStream*`、`src/api/sse.ts`、`src/components/chat/`、`src/store/useChatStore.ts` 与 `SubjectWorkspace/index.vue` 的 Chat 范围、对应测试。允许重组 Chat 专属实现，Workspace 非 Chat 区域保持当前范围。合成原型不宣称模型链路完成。

### P2 LangChain4j、工具与执行治理

- [x] 已以 `ChatAgentOrchestrator` 替换固定 Chat 执行链，使用显式模型/工具循环；Adapter/provider 单测源码覆盖工具 call 聚合与 text/tool transport，完整 runtime 联合验证待 P4。
- [x] 已增加 owner-scoped 搜索、原文和大纲工具；context 从存档 run/source scope 构建并在执行期间复核 source owner/active/READY/revision。
- [x] 已接入独立 Chat Agent operation 与 reserve/dispatch/settle；总调用、阶段、请求 bytes、工具结果和 attempt deadline 使用集中配置，BYOK/platform 仍走既有 Gateway。
- [x] 已实现原子会话准入、取消传播、restart recovery 和 fence；READY 先持久化并停止公开输出/新工具，实际 worker 退出后释放 slot。
- [x] 用受控合成 adapter 的 Orchestrator 行为测试覆盖真实 runtime 的组件/SSE 发布路径、tool call-result 与下一轮上下文顺序；调用循环由应用显式控制，无 SDK 隐式 retry。未覆盖真实 Provider 网络或 GUI。

允许目录：Server `pom.xml`、ai 与其 internal provider/security/persistence、必要共享配置及追加迁移、PC Chat API/controller/store，以及 Mobile/Tablet Chat 的必要协议/文本消费接线。共有 HTTP/Gateway 对 Overview、embedding 和其他业务的约束不回归；旧 Chat 实现不是回归目标，测试按新需求重写。

### P3 题卡提交、保存与恢复闭环

- [x] Server 已接通可保留会话、公开/私有 DTO、组件快照、历史题卡恢复与显式删除边界。
- [x] 单/多选和开放问答使用原始 array/string wire shape；稳定 USER identity、submission idempotency 和原子落库后接续回复已实现。
- [x] 用户答案与原题精确关联；服务端校验提交形状/选项，不判分，私有 reference 不进 public DTO。
- [x] 题卡 READY 先原子持久化并硬停止公开输出/新工具；worker 实际退出后释放 slot，失败/取消 attempt 可按原 run retry。
- [ ] 前端忙碌互斥、停止确认、草稿保留、历史提交、刷新和账号切换都沿新契约，不自动收费重放。
- [ ] 对照 P0 消费点清单完成各端新契约切换，删除旧 Chat fallback/协议分支和失效测试；保留真实业务历史数据，更新新需求对应测试。

允许目录：P2 的 Chat 持久化/API、PC 聊天组件/Store 及实际调用端；会话清理规则按本次重写范围同步。复用原身份/消息能力，不修改 KB/Review/核心 Sync。

### P4 整合验证与实际验收

- [x] 完成本轮六项后端修复的 focused clean/test（6 suites、21/21）及 package；记录在 `D:/Temp/auralis-chat-six-fixes-20261029/`。首次全量结果仍失败，不标记为全量门禁通过。
- [ ] 默认一个只读 reviewer 检查 correctness、并发、权限、数据完整性及需求；OPTIONAL 不在任务内顺手修改。
- [ ] 实际 Provider、Tauri UI 的工具调用、流式组件、两类提交、停止、刷新和失败恢复分别记录，按当次授权执行，不自行部署/操作业务库。
- [ ] 统计格式成功率、局部异常、首字/首项延迟、循环次数、token 和可恢复情况，不仅看是否成功返回。

## 8. 验证节奏和命令

六项后端修复全部编辑完成后统一运行 focused clean/test 与 package；二者均通过。全量与 PostgreSQL integration 未通过/未运行，保持为未完成验收项。

后续实施按 [BeforeCoding](../agent/BeforeCoding.md)：每个交付阶段全部编辑完成后统一检查；类型/静态 → 对应测试 → 构建。依赖、共有层、API/数据库/鉴权并发变化完成后需要全量与构建，可合并为阶段交付门禁，不在编辑过程中反复执行。同一失败最多三次重试，保留真实输出。

现有命令基线（下列本轮未执行）：

```powershell
# cwd: D:/CodeBase/CodexWorktree/chat-agent-rewrite/Auralis/Auralis-Server
.\mvnw.cmd -B -ntp '-Dtest=AiMessageCommandValidationTests,ChatRuntimeControllerTests,ChatAgentProfileAdmissionTests,ChatRuntimePersistenceServiceTests,ChatRuntimeRecoveryServiceTests,ChatStreamParserTests,AiProviderRequestValidatorTests,ChatAgentModelAdapterTests,ChatPublicProjectionTests,OpenAiCompatibleChatToolStreamTests,AiInvocationGatewayTests,AiOperationPolicyTests,ProviderHttpClientTests,AiConversationServiceTests,AiConversationControllerTests' test
.\mvnw.cmd -B -ntp test
.\mvnw.cmd -B -ntp package

# cwd: D:/CodeBase/Active/Auralis/Auralis-PC
npm.cmd run type-check
npm.cmd run check:r4-pc
node --experimental-strip-types --test scripts/r4-ai-stream.test.mjs scripts/r4-reliability.test.mjs scripts/r4-reading-session.test.mjs
npm.cmd run test:r4-pc
npm.cmd run build

# cwd: D:/CodeBase/Active/Auralis
pwsh -NoProfile -File scripts/check-openapi.ps1
```

新增协议、执行、提交、迁移及组件测试类在 P0/P1 确认名称后加入 focused batch，不把示例类名当成已存在测试。真实 PostgreSQL 覆盖会话竞争、幂等、取消/重启和删除；模拟流覆盖任意分片、异常尾部、工具重入与部分回复。

## 9. 文档、委派与工作树保护

- 本计划实施时同步 ProductRequirements、Architecture、Frontend、FrontendPC、Backend、API、Database 与当阶段真实 Status/Issues；新增公开契约更新 OpenAPI 和 SDK。配置变化同步 Infrastructure/Deployment/Runbook，已发生的交付才进入 Changelog。
- 普通实现/检查依 AGENTS 委派；前端实现按仓库 Antigravity MCP 规则先提交计划、目录范围与验证命令，再实施授权差量。纯计划编写不调用前端生成工具。
- 前端委派返回后核对完整 diff、生成/依赖/删除和跨模块写入。高风险策略/并发/迁移由主 Agent 决策，最终一次只读 review；不重复执行已有证据的普通检查。
- 在 `codex/chat-agent-rewrite` 的独立工作区实施。原目录保持原分支与未提交状态；带入的 Overview 与资料处理文件作为工作基础，按 dirty 基线隔离，不归因到 Chat 交付。Chat 专属代码按新方案直接替换并删除弃用执行路径；证据放 D:/Temp，不清业务缓存、不删除数据、不恢复用户修改。
- 官方能力参考仅用于 P0 选型，以实际锁定版本验证为准：[Tools](https://docs.langchain4j.dev/tutorials/tools/)、[Streaming](https://docs.langchain4j.dev/tutorials/response-streaming/)、[ChatMemory](https://docs.langchain4j.dev/tutorials/chat-memory/)、[NDJSON](https://github.com/ndjson/ndjson-spec)。
